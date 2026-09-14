import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { folderNameMatchesCustomer } from '@/lib/drive/customer-folder-name';
import { sanitizeDriveFileFolderName } from '@/lib/drive/job-folder-name';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Escape a string for use inside a Drive API `q` clause (single-quoted literal). */
function escapeDriveQueryLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function findFolderNamedUnderParent(
  auth: OAuth2Client,
  parentId: string,
  rawName: string,
  opts?: { loose?: boolean },
): Promise<{ id: string; name: string } | null> {
  const name = sanitizeDriveFileFolderName(rawName);
  if (!name) return null;

  const drive = google.drive({ version: 'v3', auth });
  const esc = escapeDriveQueryLiteral(name);
  const q = `'${parentId}' in parents and trashed = false and mimeType = '${FOLDER_MIME}' and name = '${esc}'`;

  const res = await drive.files.list({
    q,
    pageSize: 15,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = (res.data.files ?? []).filter((f): f is { id: string; name: string } => Boolean(f.id && f.name));
  const exact = files.find((f) => f.name === name);
  if (exact) return exact;
  const ci = files.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (ci) return ci;
  if (opts?.loose === false) return null;

  const listed = await drive.files.list({
    q: `'${parentId}' in parents and trashed = false and mimeType = '${FOLDER_MIME}'`,
    pageSize: 200,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const children = (listed.data.files ?? []).filter((f): f is { id: string; name: string } =>
    Boolean(f.id && f.name),
  );
  return children.find((f) => folderNameMatchesCustomer(f.name, name)) ?? null;
}

/**
 * Ensures a direct child folder of `parentId` exists with the given display name (sanitized).
 * Used for the optional customer shortcut hub (Hub / Customer / shortcuts). Stage buckets hold job folders flat.
 */
export async function ensureFolderNamedUnderParent(
  auth: OAuth2Client,
  parentId: string,
  rawName: string,
): Promise<string> {
  let name = sanitizeDriveFileFolderName(rawName);
  if (!name) name = 'Customer';

  const existing = await findFolderNamedUnderParent(auth, parentId, name);
  if (existing) return existing.id;

  const drive = google.drive({ version: 'v3', auth });
  const { data: created } = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    supportsAllDrives: true,
    fields: 'id',
  });
  return created.id!;
}
