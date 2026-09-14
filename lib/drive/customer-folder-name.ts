import { sanitizeDriveFileFolderName } from '@/lib/drive/job-folder-name';

/** Job folders are named `Customer - YYYY-MM-DD - Project`. Those are not customer hubs. */
export function looksLikeDriveJobFolderName(name: string): boolean {
  return / - \d{4}-\d{2}-\d{2} - /.test(name);
}

function normalizeCustomerFolderName(name: string): string {
  return sanitizeDriveFileFolderName(name)
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(llc|inc|incorporated|ltd|limited|co|corp|corporation|company)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function folderNameMatchesCustomer(folderName: string, customerName: string): boolean {
  if (!folderName.trim() || !customerName.trim()) return false;
  if (looksLikeDriveJobFolderName(folderName)) return false;
  const a = sanitizeDriveFileFolderName(folderName);
  const b = sanitizeDriveFileFolderName(customerName);
  if (a === b || a.toLowerCase() === b.toLowerCase()) return true;
  const na = normalizeCustomerFolderName(folderName);
  const nb = normalizeCustomerFolderName(customerName);
  return Boolean(na && nb && na === nb);
}
