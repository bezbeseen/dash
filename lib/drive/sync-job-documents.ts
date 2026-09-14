import { prisma } from '@/lib/db/prisma';
import { formatDriveUserError } from '@/lib/drive/api';
import { resolveCustomerDriveFolderForJob } from '@/lib/drive/resolve-customer-folder';
import { syncQboPdfsToDriveFolder } from '@/lib/drive/sync-qbo-pdfs-to-drive';
import { getGmailOAuth2ClientForConnection, getGmailOAuth2ClientForApi } from '@/lib/gmail/tokens-db';

export type SyncJobDriveDocumentsResult =
  | { ok: true; folderId: string; folderName: string; via: 'job' | 'customer' }
  | { ok: false; error: string };

export async function syncJobDriveDocuments(jobId: string): Promise<SyncJobDriveDocumentsResult> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      customerName: true,
      googleDriveFolderId: true,
      gmailConnectionId: true,
      quickbooksCompanyId: true,
      quickbooksEstimateId: true,
      quickbooksInvoiceId: true,
    },
  });

  if (!job) return { ok: false, error: 'Job not found.' };
  if (!job.quickbooksCompanyId) {
    return { ok: false, error: 'This ticket has no QuickBooks company yet. Sync from QuickBooks first.' };
  }
  if (!job.quickbooksInvoiceId && !job.quickbooksEstimateId) {
    return {
      ok: false,
      error: 'No QuickBooks invoice or estimate on this ticket yet. Sync from QuickBooks first.',
    };
  }

  try {
    const auth = job.gmailConnectionId
      ? await getGmailOAuth2ClientForConnection(job.gmailConnectionId)
      : await getGmailOAuth2ClientForApi();

    let destId = job.googleDriveFolderId;
    let via: 'job' | 'customer' = 'job';
    let folderName = 'job folder';

    if (!destId) {
      const customer = await resolveCustomerDriveFolderForJob(jobId);
      if (!customer) {
        return {
          ok: false,
          error: `No existing Drive folder named “${job.customerName}”. Rename the customer folder to match, or paste a folder link.`,
        };
      }
      destId = customer.id;
      via = 'customer';
      folderName = customer.name;
    }

    await syncQboPdfsToDriveFolder(auth, job, destId, { createInvoicesSubfolder: via === 'job' });
    await prisma.job.update({
      where: { id: jobId },
      data: { googleDriveLastError: null },
    });
    return { ok: true, folderId: destId, folderName, via };
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
}
