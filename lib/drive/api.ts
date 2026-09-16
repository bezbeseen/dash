import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

export type DriveFolderListItem = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
};

function driveV3(auth: OAuth2Client) {
  return google.drive({ version: 'v3', auth });
}

export async function getDriveFolderParents(auth: OAuth2Client, folderId: string): Promise<string[]> {
  const drive = driveV3(auth);
  const res = await drive.files.get({
    fileId: folderId,
    fields: 'parents',
    supportsAllDrives: true,
  });
  return res.data.parents ?? [];
}

/**
 * Moves a Drive folder under `newParentId` (shared drive safe).
 */
export async function moveDriveItemToParent(
  auth: OAuth2Client,
  fileId: string,
  newParentId: string,
): Promise<void> {
  const parents = await getDriveFolderParents(auth, fileId);
  const removeParents = parents.join(',');
  const drive = driveV3(auth);
  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: removeParents || undefined,
    supportsAllDrives: true,
    fields: 'id, parents',
  });
}

export async function listDriveFolderChildren(
  auth: OAuth2Client,
  folderId: string,
  max = 40,
): Promise<DriveFolderListItem[]> {
  const drive = driveV3(auth);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    pageSize: max,
    fields: 'files(id, name, mimeType, webViewLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    orderBy: 'folder desc, name_natural',
  });
  const files = res.data.files ?? [];
  return files.map((f) => ({
    id: f.id!,
    name: f.name ?? '(untitled)',
    mimeType: f.mimeType ?? 'application/octet-stream',
    webViewLink: f.webViewLink ?? null,
  }));
}

function escapeDriveQueryLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function getDriveFileName(auth: OAuth2Client, fileId: string): Promise<string> {
  const drive = driveV3(auth);
  const res = await drive.files.get({
    fileId,
    fields: 'name',
    supportsAllDrives: true,
  });
  return res.data.name ?? '';
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function googleApiStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const status = (err as { response?: { status?: number } }).response?.status;
  return typeof status === 'number' ? status : null;
}

function googleApiMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const api = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
      ?.message;
    if (typeof api === 'string' && api.trim()) return api;
    if (err instanceof Error && err.message) return err.message;
  }
  return String(err);
}

/** Confirm a folder id exists and this Google account can open it (shared-drive safe). */
export async function assertDriveFolderAccessible(
  auth: OAuth2Client,
  folderId: string,
  label: string,
): Promise<void> {
  const drive = driveV3(auth);
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, trashed',
      supportsAllDrives: true,
    });
    if (res.data.trashed) {
      throw new Error(`${label} is in the trash. Restore it in Drive or update that folder id.`);
    }
    if (res.data.mimeType && res.data.mimeType !== FOLDER_MIME) {
      throw new Error(`${label} is a file, not a folder. Use a Drive folder link.`);
    }
  } catch (e) {
    if (e instanceof Error && /is in the trash|is a file, not a folder/.test(e.message)) {
      throw e;
    }
    const status = googleApiStatus(e);
    const apiMsg = googleApiMessage(e);
    if (status === 404 || /not found|404/i.test(apiMsg)) {
      throw new Error(
        `${label} was not found. This Google account cannot see it, or the id is wrong / deleted.`,
      );
    }
    throw new Error(`${label}: ${formatDriveUserError(e)}`);
  }
}

const LABELED_DRIVE_ERROR =
  /was not found|is in the trash|is a file, not a folder|GOOGLE_DRIVE_|is not set \(or is not a Drive/;

export function formatDriveUserError(err: unknown): string {
  const status = googleApiStatus(err);
  const msg = googleApiMessage(err);
  if (
    LABELED_DRIVE_ERROR.test(msg) &&
    !/^File not found:/i.test(msg) &&
    !/^Requested entity was not found/i.test(msg)
  ) {
    return msg;
  }
  if (/insufficient authentication scopes|accessNotConfigured|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(msg)) {
    return 'Google needs Drive permission; reconnect Gmail in Settings (includes Drive folder moves).';
  }
  if (status === 403 || /Forbidden|403/.test(msg)) {
    return 'Drive returned forbidden. Check shared drive membership and folder access for this Google account.';
  }
  if (status === 404 || /not found|404/i.test(msg)) {
    const fileId = msg.match(/File not found:\s*([a-zA-Z0-9_-]+)/i)?.[1];
    if (fileId) {
      return `Drive could not find folder ${fileId}. It may be deleted, or this Google account cannot see it. Check the template and Active (or Client Jobs root) ids in env-check → googleDrive.`;
    }
    return 'Folder not found. Verify the folder ID still exists and is in a shared drive you can access.';
  }
  return msg.length > 200 ? `${msg.slice(0, 200)}...` : msg;
}

export async function renameDriveFileIfNeeded(auth: OAuth2Client, fileId: string, desiredName: string): Promise<void> {
  const current = await getDriveFileName(auth, fileId);
  if (current === desiredName) return;
  const drive = driveV3(auth);
  await drive.files.update({
    fileId,
    requestBody: { name: desiredName },
    supportsAllDrives: true,
    fields: 'id',
  });
}

export type DriveFolderNameHit = {
  id: string;
  name: string;
  parents: string[];
};

/** Find folders with this exact Drive name anywhere this account can see (shared-drive safe). */
export async function findDriveFoldersByExactName(
  auth: OAuth2Client,
  name: string,
  max = 20,
): Promise<DriveFolderNameHit[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const drive = driveV3(auth);
  const esc = escapeDriveQueryLiteral(trimmed);
  const q = `mimeType = '${FOLDER_MIME}' and trashed = false and name = '${esc}'`;
  const params = {
    q,
    pageSize: max,
    fields: 'files(id, name, parents)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  };
  let res;
  try {
    res = await drive.files.list({ ...params, corpora: 'allDrives' });
  } catch {
    res = await drive.files.list(params);
  }
  const files = res.data.files ?? [];
  return files.flatMap((f) => {
    if (!f.id || !f.name) return [];
    return [{ id: f.id, name: f.name, parents: f.parents ?? [] }];
  });
}

/** Find a direct child (any mime type) with exact name. */
export async function findDriveChildByName(
  auth: OAuth2Client,
  parentId: string,
  name: string,
): Promise<string | null> {
  const drive = driveV3(auth);
  const esc = escapeDriveQueryLiteral(name);
  const q = `'${parentId}' in parents and trashed = false and name = '${esc}'`;
  const res = await drive.files.list({
    q,
    pageSize: 5,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}
