import type { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { prisma } from '@/lib/db/prisma';
import {
  DRIVE_FOLDER_MIME,
  formatDriveUserError,
  listDriveFolderChildren,
  type DriveFolderListItem,
} from '@/lib/drive/api';
import { getAuthForGoogleDrive } from '@/lib/drive/auth';

export type DrivePreviewFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  hasThumbnail: boolean;
  isFolder: boolean;
};

export type DrivePreviewGroup = {
  id: string;
  name: string;
  webViewLink: string | null;
  files: DrivePreviewFile[];
  extraCount: number;
};

const MAX_TOP_FOLDERS = 16;
const MAX_FILES_PER_FOLDER = 8;

function toPreviewFile(item: DriveFolderListItem): DrivePreviewFile {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    webViewLink: item.webViewLink,
    hasThumbnail: item.hasThumbnail && item.mimeType !== DRIVE_FOLDER_MIME,
    isFolder: item.mimeType === DRIVE_FOLDER_MIME,
  };
}

function sortPreviewFiles(files: DrivePreviewFile[]): DrivePreviewFile[] {
  return [...files].sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? 1 : -1;
    if (a.hasThumbnail !== b.hasThumbnail) return a.hasThumbnail ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

async function listGroupFiles(
  auth: OAuth2Client,
  folderId: string,
): Promise<{ files: DrivePreviewFile[]; extraCount: number }> {
  const listed = await listDriveFolderChildren(auth, folderId, MAX_FILES_PER_FOLDER + 1);
  const extraCount = Math.max(0, listed.length - MAX_FILES_PER_FOLDER);
  const files = sortPreviewFiles(listed.slice(0, MAX_FILES_PER_FOLDER).map(toPreviewFile));
  return { files, extraCount };
}

export async function listJobDriveFolderPreview(jobId: string): Promise<{
  groups: DrivePreviewGroup[];
  listError: string | null;
}> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { googleDriveFolderId: true },
  });
  const id = job?.googleDriveFolderId;
  if (!job || !id) {
    return { groups: [], listError: null };
  }

  try {
    const { auth } = await getAuthForGoogleDrive({
      probeFolderId: id,
      probeLabel: 'This ticket’s Drive folder',
    });
    const top = await listDriveFolderChildren(auth, id, 40);
    const folders = top.filter((item) => item.mimeType === DRIVE_FOLDER_MIME).slice(0, MAX_TOP_FOLDERS);
    const rootFiles = sortPreviewFiles(
      top.filter((item) => item.mimeType !== DRIVE_FOLDER_MIME).slice(0, MAX_FILES_PER_FOLDER).map(toPreviewFile),
    );

    const nested = await Promise.all(
      folders.map(async (folder) => {
        try {
          const inner = await listGroupFiles(auth, folder.id);
          return {
            id: folder.id,
            name: folder.name,
            webViewLink: folder.webViewLink,
            files: inner.files,
            extraCount: inner.extraCount,
          } satisfies DrivePreviewGroup;
        } catch {
          return {
            id: folder.id,
            name: folder.name,
            webViewLink: folder.webViewLink,
            files: [],
            extraCount: 0,
          } satisfies DrivePreviewGroup;
        }
      }),
    );

    const groups: DrivePreviewGroup[] = [];
    if (rootFiles.length > 0) {
      groups.push({
        id,
        name: 'In this folder',
        webViewLink: `https://drive.google.com/drive/folders/${id}`,
        files: rootFiles,
        extraCount: Math.max(0, top.filter((item) => item.mimeType !== DRIVE_FOLDER_MIME).length - MAX_FILES_PER_FOLDER),
      });
    }
    groups.push(...nested);
    return { groups, listError: null };
  } catch (e) {
    return { groups: [], listError: formatDriveUserError(e) };
  }
}

export async function driveItemIsUnderFolder(
  auth: OAuth2Client,
  fileId: string,
  rootFolderId: string,
): Promise<boolean> {
  if (fileId === rootFolderId) return true;
  const drive = google.drive({ version: 'v3', auth });
  let current = fileId;
  for (let i = 0; i < 12; i++) {
    const res = await drive.files.get({
      fileId: current,
      fields: 'id, parents',
      supportsAllDrives: true,
    });
    const parents = res.data.parents ?? [];
    if (parents.includes(rootFolderId)) return true;
    if (parents.length === 0) return false;
    const next = parents[0];
    if (!next) return false;
    if (next === rootFolderId) return true;
    current = next;
  }
  return false;
}

function previewLabel(name: string, mimeType: string): string {
  if (mimeType === DRIVE_FOLDER_MIME) return 'Folder';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Image';
  const ext = name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') ?? '';
  if (ext && ext.length <= 5 && ext !== name) return ext.toUpperCase();
  return 'File';
}

function placeholderSvg(name: string, mimeType: string): Buffer {
  const label = previewLabel(name, mimeType).slice(0, 8).replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
  <rect width="320" height="240" fill="#eef2f5"/>
  <rect x="110" y="52" width="100" height="118" rx="10" fill="#fff" stroke="#c5d0d8"/>
  <text x="160" y="200" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" fill="#5c6b75">${label}</text>
</svg>`;
  return Buffer.from(svg);
}

async function fetchThumbnailBytes(url: string, accessToken: string | null | undefined): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const headers: Record<string, string> = { Accept: 'image/*,*/*' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 20) return null;
    return { body: buf, contentType: contentType.startsWith('image/') ? contentType : 'image/jpeg' };
  } catch {
    return null;
  }
}

export async function loadDrivePreviewImage(
  auth: OAuth2Client,
  fileId: string,
): Promise<{ body: Buffer; contentType: string }> {
  const drive = google.drive({ version: 'v3', auth });
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, thumbnailLink, hasThumbnail',
    supportsAllDrives: true,
  });
  const name = meta.data.name ?? 'file';
  const mimeType = meta.data.mimeType ?? 'application/octet-stream';
  const token = (await auth.getAccessToken()).token;
  const thumbnailLink = meta.data.thumbnailLink?.replace(/=s\d+$/, '=s320') ?? null;
  if (thumbnailLink) {
    const fromLink = await fetchThumbnailBytes(thumbnailLink, token);
    if (fromLink) return fromLink;
  }
  const fromDriveThumb = await fetchThumbnailBytes(
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w320`,
    token,
  );
  if (fromDriveThumb) return fromDriveThumb;
  return { body: placeholderSvg(name, mimeType), contentType: 'image/svg+xml' };
}
