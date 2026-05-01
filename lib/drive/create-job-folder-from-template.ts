import { prisma } from '@/lib/db/prisma';
import { formatDriveUserError } from '@/lib/drive/api';
import { driveParentIdForBucket, getJobFolderTemplateId } from '@/lib/drive/config';
import { duplicateDriveFolderTree } from '@/lib/drive/duplicate-template-folder';
import { buildDriveJobFolderName } from '@/lib/drive/job-folder-name';
import { syncJobDriveFolder } from '@/lib/drive/sync-job-folder';
import { getGmailOAuth2ClientForConnection, getGmailOAuth2ClientForApi } from '@/lib/gmail/tokens-db';

export type CreateJobFolderFromTemplateResult =
  | { ok: true; folderId: string }
  | { ok: false; error: string };

export async function createJobFolderFromTemplate(jobId: string): Promise<CreateJobFolderFromTemplateResult> {
  const templateId = getJobFolderTemplateId();
  if (!templateId) {
    return { ok: false, error: 'Set GOOGLE_DRIVE_JOB_FOLDER_TEMPLATE_ID to your template folder id.' };
  }

  const activeParent = driveParentIdForBucket('ACTIVE');
  if (!activeParent) {
    return { ok: false, error: 'GOOGLE_DRIVE_ACTIVE_FOLDER_ID is not set.' };
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      customerName: true,
      projectName: true,
      createdAt: true,
      googleDriveFolderId: true,
      gmailConnectionId: true,
    },
  });

  if (!job) {
    return { ok: false, error: 'Job not found.' };
  }
  if (job.googleDriveFolderId) {
    return {
      ok: false,
      error: 'This ticket already has a Drive folder. Clear the link first if you need a new one.',
    };
  }

  const auth = job.gmailConnectionId
    ? await getGmailOAuth2ClientForConnection(job.gmailConnectionId)
    : await getGmailOAuth2ClientForApi();

  const name = buildDriveJobFolderName({
    customerName: job.customerName,
    projectName: job.projectName,
    createdAt: job.createdAt,
  });

  let newFolderId: string;
  try {
    newFolderId = await duplicateDriveFolderTree(auth, templateId, activeParent, name);
  } catch (e) {
    const message = formatDriveUserError(e);
    await prisma.job
      .update({
        where: { id: jobId },
        data: { googleDriveLastError: message },
      })
      .catch(() => {});
    return { ok: false, error: message };
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      googleDriveFolderId: newFolderId,
      googleDriveLastError: null,
    },
  });

  const syncResult = await syncJobDriveFolder(jobId);
  if (!syncResult.ok) {
    return {
      ok: false,
      error: `Folder was created but placement failed: ${syncResult.error}. Use "Move folder now" after fixing access.`,
    };
  }

  return { ok: true, folderId: newFolderId };
}
