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

export function isGoogleDriveBucketSyncConfigured(): boolean {
  return Boolean(
    driveParentIdForBucket('ACTIVE') &&
      driveParentIdForBucket('COMPLETED') &&
      driveParentIdForBucket('ARCHIVE'),
  );
}

/** Folder id for "New Job Folder Template" (or env) - duplicated into Active when creating from the ticket. */
export function getJobFolderTemplateId(): string | null {
  return envFolderId(process.env.GOOGLE_DRIVE_JOB_FOLDER_TEMPLATE_ID);
}

export function canCreateDriveJobFolderFromTemplate(): boolean {
  return Boolean(
    getJobFolderTemplateId() &&
      driveParentIdForBucket('ACTIVE') &&
      driveParentIdForBucket('COMPLETED') &&
      driveParentIdForBucket('ARCHIVE'),
  );
}
