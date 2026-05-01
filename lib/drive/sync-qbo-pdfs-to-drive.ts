import { Readable } from 'stream';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { findDriveChildByName } from '@/lib/drive/api';
import { ensureFolderNamedUnderParent } from '@/lib/drive/ensure-customer-subfolder';
import { sanitizeDriveFileFolderName } from '@/lib/drive/job-folder-name';
import {
  fetchEstimateById,
  fetchEstimatePdf,
  fetchInvoiceById,
  fetchInvoicePdf,
} from '@/lib/quickbooks/client';

/** Subfolder under each job folder for QuickBooks PDFs (estimates + invoices). */
export const QBO_PDFS_DRIVE_SUBFOLDER_NAME = 'Invoices and quotes';

function safePdfBaseName(docNumber: string | undefined, fallbackId: string): string {
  const raw = (docNumber?.trim() || fallbackId).replace(/[/\\?*:|"<>]/g, '-');
  return sanitizeDriveFileFolderName(raw).replace(/\s+/g, ' ').trim() || fallbackId;
}

async function uploadOrReplacePdf(
  auth: OAuth2Client,
  parentId: string,
  pdfName: string,
  pdfBytes: ArrayBuffer,
): Promise<void> {
  const drive = google.drive({ version: 'v3', auth });
  const buf = Buffer.from(pdfBytes);
  const existingId = await findDriveChildByName(auth, parentId, pdfName);
  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(buf)) },
      supportsAllDrives: true,
    });
    return;
  }
  await drive.files.create({
    requestBody: { name: pdfName, parents: [parentId] },
    media: { mimeType: 'application/pdf', body: Readable.from(buf) },
    supportsAllDrives: true,
    fields: 'id',
  });
}

export type JobForQboPdfsToDrive = {
  id: string;
  googleDriveFolderId: string | null;
  quickbooksCompanyId: string | null;
  quickbooksEstimateId: string | null;
  quickbooksInvoiceId: string | null;
};

/**
 * Ensures QuickBooks estimate and invoice PDFs exist under Job folder / "Invoices and quotes".
 * Creates or replaces files by stable names. Failures should be logged by the caller.
 */
export async function syncQboPdfsToJobDriveFolder(auth: OAuth2Client, job: JobForQboPdfsToDrive): Promise<void> {
  const folderId = job.googleDriveFolderId;
  const realmId = job.quickbooksCompanyId;
  if (!folderId || !realmId) return;

  const hasEstimate = Boolean(job.quickbooksEstimateId);
  const hasInvoice = Boolean(job.quickbooksInvoiceId);
  if (!hasEstimate && !hasInvoice) return;

  const docsParent = await ensureFolderNamedUnderParent(auth, folderId, QBO_PDFS_DRIVE_SUBFOLDER_NAME);

  if (job.quickbooksEstimateId) {
    try {
      const snap = await fetchEstimateById(realmId, job.quickbooksEstimateId);
      const name = `Estimate-${safePdfBaseName(snap.docNumber, job.quickbooksEstimateId)}.pdf`;
      const pdfBytes = await fetchEstimatePdf(realmId, job.quickbooksEstimateId);
      await uploadOrReplacePdf(auth, docsParent, name, pdfBytes);
    } catch (e) {
      console.error('[drive] estimate PDF to folder', job.id, e);
    }
  }

  if (job.quickbooksInvoiceId) {
    try {
      const snap = await fetchInvoiceById(realmId, job.quickbooksInvoiceId);
      const name = `Invoice-${safePdfBaseName(snap.docNumber, job.quickbooksInvoiceId)}.pdf`;
      const pdfBytes = await fetchInvoicePdf(realmId, job.quickbooksInvoiceId);
      await uploadOrReplacePdf(auth, docsParent, name, pdfBytes);
    } catch (e) {
      console.error('[drive] invoice PDF to folder', job.id, e);
    }
  }
}
