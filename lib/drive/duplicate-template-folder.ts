import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function listDirectChildren(
  auth: OAuth2Client,
  folderId: string,
): Promise<{ id: string; name: string; mimeType: string }[]> {
  const drive = google.drive({ version: 'v3', auth });
  const out: { id: string; name: string; mimeType: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 100,
      fields: 'nextPageToken, files(id, name, mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) {
        out.push({ id: f.id, name: f.name, mimeType: f.mimeType ?? '' });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/**
 * Create a new folder tree under `destParentId` mirroring `sourceFolderId` (files copied, subfolders recreated).
 * Drive's files.copy on folders does not reliably copy children; this walks the template explicitly.
 */
export async function duplicateDriveFolderTree(
  auth: OAuth2Client,
  sourceFolderId: string,
  destParentId: string,
  newRootName: string,
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth });
  const { data: created } = await drive.files.create({
    requestBody: {
      name: newRootName,
      mimeType: FOLDER_MIME,
      parents: [destParentId],
    },
    supportsAllDrives: true,
    fields: 'id',
  });
  const newRootId = created.id!;

  const children = await listDirectChildren(auth, sourceFolderId);
  for (const c of children) {
    if (c.mimeType === FOLDER_MIME) {
      await duplicateDriveFolderTree(auth, c.id, newRootId, c.name);
    } else {
      await drive.files.copy({
        fileId: c.id,
        requestBody: { name: c.name, parents: [newRootId] },
        supportsAllDrives: true,
      });
    }
  }

  return newRootId;
}
