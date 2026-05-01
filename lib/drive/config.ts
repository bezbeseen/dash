import type { DriveBucket } from '@/lib/drive/resolve-bucket';
import { parseGoogleDriveFolderId } from '@/lib/drive/parse-folder-id';

function envFolderId(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const parsed = parseGoogleDriveFolderId(t);
  return parsed ?? t;
}

export function driveParentIdForBucket(bucket: DriveBucket): string | null {
  const v =
    bucket === 'ACTIVE'
      ? process.env.GOOGLE_DRIVE_ACTIVE_FOLDER_ID
      : bucket === 'COMPLETED'
        ? process.env.GOOGLE_DRIVE_COMPLETED_FOLDER_ID
        : process.env.GOOGLE_DRIVE_ARCHIVE_FOLDER_ID;
  return envFolderId(v);
}

/** Parent of all customer folders (e.g. CLIENT JOBS). When set, layout is Customer / stage / job; legacy three bucket ids are not required. */
export function getClientJobsRootFolderId(): string | null {
  return envFolderId(process.env.GOOGLE_DRIVE_CLIENT_JOBS_ROOT_ID);
}

/**
 * Optional "by client" hub at the same Drive level as stage buckets: Hub / Customer / shortcuts to real job folders.
 * Canonical job folders still live under Active|Completed|Archive; shortcuts stay in sync when jobs move.
 */
export function getCustomerHubFolderId(): string | null {
  return envFolderId(process.env.GOOGLE_DRIVE_CUSTOMER_HUB_FOLDER_ID);
}

function trimOrUndef(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t || undefined;
}

/** Folder names under each customer: Active, Completed, Archive (match your Drive naming). */
export function stageSubfolderNameForBucket(bucket: DriveBucket): string {
  if (bucket === 'ACTIVE') {
    return trimOrUndef(process.env.GOOGLE_DRIVE_STAGE_ACTIVE_FOLDER_NAME) ?? '01_ACTIVE';
  }
  if (bucket === 'COMPLETED') {
    return trimOrUndef(process.env.GOOGLE_DRIVE_STAGE_COMPLETED_FOLDER_NAME) ?? '02_COMPLETED';
  }
  return trimOrUndef(process.env.GOOGLE_DRIVE_STAGE_ARCHIVE_FOLDER_NAME) ?? '03_ARCHIVE';
}

export function isGoogleDriveBucketSyncConfigured(): boolean {
  if (getClientJobsRootFolderId()) return true;
  return Boolean(
    driveParentIdForBucket('ACTIVE') &&
      driveParentIdForBucket('COMPLETED') &&
      driveParentIdForBucket('ARCHIVE'),
  );
}

/** Folder id for "New Job Folder Template" (or env) - copied when creating from the ticket. */
export function getJobFolderTemplateId(): string | null {
  return envFolderId(process.env.GOOGLE_DRIVE_JOB_FOLDER_TEMPLATE_ID);
}

export function canCreateDriveJobFolderFromTemplate(): boolean {
  if (!getJobFolderTemplateId()) return false;
  if (getClientJobsRootFolderId()) return true;
  return Boolean(
    driveParentIdForBucket('ACTIVE') &&
      driveParentIdForBucket('COMPLETED') &&
      driveParentIdForBucket('ARCHIVE'),
  );
}

/** Default subfolder for QBO PDF sync when your template does not already include one. */
export const QBO_PDFS_DRIVE_SUBFOLDER_DEFAULT = 'Invoices and quotes';

/** Override to match your job template (e.g. 06_Invoices Quotes). If unset we try to reuse an existing invoices/quotes folder. */
export function getQboPdfsSubfolderNameOrDefault(): string {
  return trimOrUndef(process.env.GOOGLE_DRIVE_QBO_PDFS_SUBFOLDER_NAME) ?? QBO_PDFS_DRIVE_SUBFOLDER_DEFAULT;
}
