import { Readable } from 'stream';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { findDriveChildByName, listDriveFolderChildren } from '@/lib/drive/api';
import {
  getQboPdfsSubfolderNameOrDefault,
  QBO_PDFS_DRIVE_SUBFOLDER_DEFAULT,
} from '@/lib/drive/config';
import { ensureFolderNamedUnderParent } from '@/lib/drive/ensure-customer-subfolder';
import { sanitizeDriveFileFolderName } from '@/lib/drive/job-folder-name';
import {
  fetchEstimateById,
  fetchEstimatePdf,
  fetchInvoiceById,
  fetchInvoicePdf,
} from '@/lib/quickbooks/client';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function normFolderName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Names like "06_Invoices Quotes" from templates ù avoids duplicating a separate "Invoices and quotes". */
function folderLooksLikeInvoicesQuotesFolder(name: string): boolean {
  const n = name.toLowerCase();
  if (!n.includes('invoice')) return false;
  if (!n.includes('quote') && !n.includes('quot')) return false;
  return true;
}

/**
 * Reuse your template's invoices/quotes folder when possible; otherwise create the configured/default name.
 */
export async function resolveQboPdfsParentFolder(
  auth: OAuth2Client,
  jobFolderId: string,
): Promise<string> {
  const preferred = getQboPdfsSubfolderNameOrDefault();
  const configuredOnly = process.env.GOOGLE_DRIVE_QBO_PDFS_SUBFOLDER_NAME?.trim();

  const items = await listDriveFolderChildren(auth, jobFolderId, 100);
  const folders = items.filter((x) => x.mimeType === FOLDER_MIME);

  if (configuredOnly) {
    const hit = folders.find((f) => f.name === configuredOnly || normFolderName(f.name) === normFolderName(configuredOnly));
    if (hit) return hit.id;
  }

  const defaultHit = folders.find(
    (f) =>
      f.name === QBO_PDFS_DRIVE_SUBFOLDER_DEFAULT ||
      normFolderName(f.name) === normFolderName(QBO_PDFS_DRIVE_SUBFOLDER_DEFAULT),
  );
  if (defaultHit) return defaultHit.id;

  const preferredHit = folders.find(
    (f) => f.name === preferred || normFolderName(f.name) === normFolderName(preferred),
  );
  if (preferredHit) return preferredHit.id;

  const aliasMatches = folders.filter((f) => folderLooksLikeInvoicesQuotesFolder(f.name));
  if (aliasMatches.length > 0) {
    aliasMatches.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return aliasMatches[0]!.id;
  }

  return ensureFolderNamedUnderParent(auth, jobFolderId, preferred);
}

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
 * Ensures QuickBooks estimate and invoice PDFs exist under the job folder's invoices/quotes subfolder
 * (reuses template folders such as 06_Invoices Quotes when present).
 */
export async function syncQboPdfsToJobDriveFolder(auth: OAuth2Client, job: JobForQboPdfsToDrive): Promise<void> {
  const folderId = job.googleDriveFolderId;
  const realmId = job.quickbooksCompanyId;
  if (!folderId || !realmId) return;

  const hasEstimate = Boolean(job.quickbooksEstimateId);
  const hasInvoice = Boolean(job.quickbooksInvoiceId);
  if (!hasEstimate && !hasInvoice) return;

  const docsParent = await resolveQboPdfsParentFolder(auth, folderId);

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
