import type { OAuth2Client } from 'google-auth-library';
import { prisma } from '@/lib/db/prisma';
import { assertDriveFolderAccessible } from '@/lib/drive/api';
import {
  driveParentIdForBucket,
  getClientJobsRootFolderId,
  stageSubfolderNameForBucket,
} from '@/lib/drive/config';
import { ensureFolderNamedUnderParent } from '@/lib/drive/ensure-customer-subfolder';
import type { DriveBucket } from '@/lib/drive/resolve-bucket';

export type DriveJobParentFolder = {
  id: string;
  via: 'client_jobs' | 'bucket';
  label: string;
};

/**
 * Parent folder for a new or moving job folder.
 * Client-jobs layout (guides): Client Jobs / Customer / 01_ACTIVE|02_COMPLETED|03_ARCHIVE / job.
 * Legacy layout: job sits directly in the Active / Completed / Archive bucket.
 */
async function savedCustomerFolderId(job: {
  quickbooksCompanyId?: string | null;
  quickbooksCustomerId?: string | null;
}): Promise<string | null> {
  if (!job.quickbooksCompanyId || !job.quickbooksCustomerId) return null;
  const saved = await prisma.customerDriveFolder.findUnique({
    where: {
      quickbooksCompanyId_quickbooksCustomerId: {
        quickbooksCompanyId: job.quickbooksCompanyId,
        quickbooksCustomerId: job.quickbooksCustomerId,
      },
    },
    select: { googleDriveFolderId: true },
  });
  return saved?.googleDriveFolderId ?? null;
}

export async function resolveDriveJobParentFolder(
  auth: OAuth2Client,
  job: {
    customerName: string;
    quickbooksCompanyId?: string | null;
    quickbooksCustomerId?: string | null;
  },
  bucket: DriveBucket,
  opts?: { createMissing?: boolean },
): Promise<DriveJobParentFolder> {
  const createMissing = opts?.createMissing !== false;
  const clientJobsRoot = getClientJobsRootFolderId();
  if (clientJobsRoot) {
    await assertDriveFolderAccessible(auth, clientJobsRoot, 'Client jobs root (GOOGLE_DRIVE_CLIENT_JOBS_ROOT_ID)');
    if (!createMissing) {
      throw new Error('Client jobs parent lookup without create is not used.');
    }
    let customerId: string | null = null;
    const savedId = await savedCustomerFolderId(job);
    if (savedId) {
      try {
        await assertDriveFolderAccessible(auth, savedId, 'Saved customer folder');
        customerId = savedId;
      } catch {
        customerId = null;
      }
    }
    if (!customerId) {
      customerId = await ensureFolderNamedUnderParent(auth, clientJobsRoot, job.customerName.trim() || 'Customer');
    }
    const stageName = stageSubfolderNameForBucket(bucket);
    const stageId = await ensureFolderNamedUnderParent(auth, customerId, stageName);
    await assertDriveFolderAccessible(auth, stageId, `${stageName} folder`);
    return { id: stageId, via: 'client_jobs', label: `${job.customerName} / ${stageName}` };
  }

  const bucketId = driveParentIdForBucket(bucket);
  if (!bucketId) {
    throw new Error(
      bucket === 'ACTIVE'
        ? 'GOOGLE_DRIVE_ACTIVE_FOLDER_ID is not set (or is not a Drive folder URL/id). See /api/integrations/env-check → googleDrive.'
        : `GOOGLE_DRIVE_${bucket}_FOLDER_ID is not set (or is not a Drive folder URL/id). See /api/integrations/env-check → googleDrive.`,
    );
  }
  await assertDriveFolderAccessible(
    auth,
    bucketId,
    bucket === 'ACTIVE'
      ? 'Active jobs folder (GOOGLE_DRIVE_ACTIVE_FOLDER_ID)'
      : `${bucket} jobs folder (GOOGLE_DRIVE_${bucket}_FOLDER_ID)`,
  );
  return { id: bucketId, via: 'bucket', label: `${bucket} jobs` };
}
