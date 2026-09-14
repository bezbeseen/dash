import { prisma } from '@/lib/db/prisma';
import { isGoogleDriveBucketSyncConfigured } from '@/lib/drive/config';
import { syncCustomerHubShortcut } from '@/lib/drive/customer-hub-shortcut';
import {
  assertDriveFolderAccessible,
  formatDriveUserError,
  getDriveFolderParents,
  moveDriveItemToParent,
  renameDriveFileIfNeeded,
} from '@/lib/drive/api';
import { buildDriveJobFolderName } from '@/lib/drive/job-folder-name';
import { resolveDriveJobParentFolder } from '@/lib/drive/resolve-job-parent';
import { syncQboPdfsToJobDriveFolder } from '@/lib/drive/sync-qbo-pdfs-to-drive';
import { driveBucketForJob } from '@/lib/drive/resolve-bucket';
import { getGmailOAuth2ClientForConnection, getGmailOAuth2ClientForApi } from '@/lib/gmail/tokens-db';

export type SyncJobDriveFolderResult =
  | { ok: true; skipped: true; reason: 'not_configured' | 'no_folder' | 'already_placed' }
  | { ok: true; moved: true; bucket: string }
  | { ok: true; pdfsSaved: true; folderName: string }
  | { ok: false; error: string };

async function getAuthForDriveJob(job: { gmailConnectionId: string | null }) {
  if (job.gmailConnectionId) {
    return getGmailOAuth2ClientForConnection(job.gmailConnectionId);
  }
  return getGmailOAuth2ClientForApi();
}

/**
 * Moves the job's linked Drive folder directly under the Active / Completed / Archive bucket
 * (job folder name includes client and project). Optional customer hub shortcuts stay separate.
 */
export async function syncJobDriveFolder(jobId: string): Promise<SyncJobDriveFolderResult> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      archivedAt: true,
      boardStatus: true,
      customerName: true,
      projectName: true,
      createdAt: true,
      googleDriveFolderId: true,
      gmailConnectionId: true,
      quickbooksInvoiceId: true,
      quickbooksCompanyId: true,
      quickbooksEstimateId: true,
    },
  });

  if (!job) {
    return { ok: false, error: 'Job not found.' };
  }

  if (!job.googleDriveFolderId) {
    return { ok: true, skipped: true, reason: 'no_folder' };
  }

  if (!isGoogleDriveBucketSyncConfigured()) {
    try {
      const auth = await getAuthForDriveJob(job);
      await syncQboPdfsToJobDriveFolder(auth, job);
      return { ok: true, pdfsSaved: true, folderName: 'job folder' };
    } catch (e) {
      return { ok: false, error: formatDriveUserError(e) };
    }
  }

  const bucket = driveBucketForJob(job);

  try {
    const auth = await getAuthForDriveJob(job);
    const dest = await resolveDriveJobParentFolder(auth, job, bucket, { createMissing: true });
    await assertDriveFolderAccessible(auth, job.googleDriveFolderId, 'This ticket’s Drive folder');
    const targetParent = dest.id;
    const parents = await getDriveFolderParents(auth, job.googleDriveFolderId);
    const alreadyThere = parents.includes(targetParent);
    if (!alreadyThere) {
      await moveDriveItemToParent(auth, job.googleDriveFolderId, targetParent);
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { googleDriveSyncedAt: new Date(), googleDriveLastError: null },
    });

    const desiredFolderName = buildDriveJobFolderName({
      customerName: job.customerName,
      projectName: job.projectName,
      createdAt: job.createdAt,
    });
    try {
      await renameDriveFileIfNeeded(auth, job.googleDriveFolderId, desiredFolderName);
    } catch (renameErr) {
      console.error('[drive] rename job folder', jobId, renameErr);
    }
    try {
      await syncCustomerHubShortcut(auth, job.customerName, job.googleDriveFolderId);
    } catch (hubErr) {
      console.error('[drive] customer hub shortcut', jobId, hubErr);
    }
    try {
      await syncQboPdfsToJobDriveFolder(auth, job);
    } catch (pdfErr) {
      console.error('[drive] QBO PDFs to folder', jobId, pdfErr);
    }

    if (alreadyThere) {
      return { ok: true, skipped: true, reason: 'already_placed' };
    }
    return { ok: true, moved: true, bucket };
  } catch (e) {
    const message = formatDriveUserError(e);
    await prisma.job.update({
      where: { id: jobId },
      data: { googleDriveLastError: message },
    }).catch(() => {});
    return { ok: false, error: message };
  }
}

/** Log errors only; for use after QBO sync so failures never block accounting. */
export function scheduleSyncJobDriveFolder(jobId: string) {
  syncJobDriveFolder(jobId).catch((err) => {
    console.error('[drive] scheduleSyncJobDriveFolder', jobId, err);
  });
}
