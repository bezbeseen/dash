import type { OAuth2Client } from 'google-auth-library';
import { prisma } from '@/lib/db/prisma';
import {
  assertDriveFolderAccessible,
  findDriveFoldersByExactName,
  getDriveFileName,
  getDriveFolderParents,
} from '@/lib/drive/api';
import {
  driveParentIdForBucket,
  getClientJobsRootFolderId,
  getCustomerHubFolderId,
} from '@/lib/drive/config';
import { folderNameMatchesCustomer, looksLikeDriveJobFolderName } from '@/lib/drive/customer-folder-name';
import { findFolderNamedUnderParent } from '@/lib/drive/ensure-customer-subfolder';
import { sanitizeDriveFileFolderName } from '@/lib/drive/job-folder-name';
import { parseGoogleDriveFolderId } from '@/lib/drive/parse-folder-id';
import { getGmailOAuth2ClientForConnection, getGmailOAuth2ClientForApi } from '@/lib/gmail/tokens-db';

export type ResolvedCustomerDriveFolder = {
  id: string;
  name: string;
  source: 'saved' | 'hub' | 'client_jobs' | 'active' | 'completed' | 'archive' | 'sibling' | 'search';
};

async function authForJob(job: { gmailConnectionId: string | null }): Promise<OAuth2Client> {
  if (job.gmailConnectionId) {
    return getGmailOAuth2ClientForConnection(job.gmailConnectionId);
  }
  return getGmailOAuth2ClientForApi();
}

async function rememberCustomerFolder(
  job: { quickbooksCompanyId: string | null; quickbooksCustomerId: string | null },
  folderId: string,
): Promise<void> {
  if (!job.quickbooksCompanyId || !job.quickbooksCustomerId) return;
  await prisma.customerDriveFolder.upsert({
    where: {
      quickbooksCompanyId_quickbooksCustomerId: {
        quickbooksCompanyId: job.quickbooksCompanyId,
        quickbooksCustomerId: job.quickbooksCustomerId,
      },
    },
    create: {
      quickbooksCompanyId: job.quickbooksCompanyId,
      quickbooksCustomerId: job.quickbooksCustomerId,
      googleDriveFolderId: folderId,
    },
    update: { googleDriveFolderId: folderId },
  });
}

type JobForCustomerFolder = {
  customerName: string;
  gmailConnectionId: string | null;
  quickbooksCompanyId: string | null;
  quickbooksCustomerId: string | null;
};

function configuredSearchRoots(): { id: string; source: ResolvedCustomerDriveFolder['source'] }[] {
  const searchRoots: { id: string; source: ResolvedCustomerDriveFolder['source'] }[] = [];
  const hub = getCustomerHubFolderId();
  if (hub) searchRoots.push({ id: hub, source: 'hub' });
  const clientJobs = getClientJobsRootFolderId();
  if (clientJobs) searchRoots.push({ id: clientJobs, source: 'client_jobs' });
  const active = driveParentIdForBucket('ACTIVE');
  if (active) searchRoots.push({ id: active, source: 'active' });
  const completed = driveParentIdForBucket('COMPLETED');
  if (completed) searchRoots.push({ id: completed, source: 'completed' });
  const archive = driveParentIdForBucket('ARCHIVE');
  if (archive) searchRoots.push({ id: archive, source: 'archive' });
  return searchRoots;
}

/**
 * Finds an existing Drive folder for this QuickBooks customer. Does not create folders.
 * Looks at a previously saved link, then Hub / Client Jobs / stage buckets (and their parent,
 * where customer folders often sit next to Active/Completed/Archive), then a Drive-wide name search.
 */
export async function resolveCustomerDriveFolderForJob(jobId: string): Promise<ResolvedCustomerDriveFolder | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      customerName: true,
      gmailConnectionId: true,
      quickbooksCompanyId: true,
      quickbooksCustomerId: true,
    },
  });
  if (!job) return null;
  return resolveCustomerDriveFolder(job);
}

async function resolveCustomerDriveFolder(job: JobForCustomerFolder): Promise<ResolvedCustomerDriveFolder | null> {
  const customerName = job.customerName.trim();
  if (!customerName) return null;

  const auth = await authForJob(job);

  if (job.quickbooksCompanyId && job.quickbooksCustomerId) {
    const saved = await prisma.customerDriveFolder.findUnique({
      where: {
        quickbooksCompanyId_quickbooksCustomerId: {
          quickbooksCompanyId: job.quickbooksCompanyId,
          quickbooksCustomerId: job.quickbooksCustomerId,
        },
      },
    });
    if (saved?.googleDriveFolderId) {
      try {
        await assertDriveFolderAccessible(auth, saved.googleDriveFolderId, 'Saved customer folder');
        const name = (await getDriveFileName(auth, saved.googleDriveFolderId).catch(() => '')) || customerName;
        return { id: saved.googleDriveFolderId, name, source: 'saved' };
      } catch {
        await prisma.customerDriveFolder.delete({ where: { id: saved.id } }).catch(() => {});
      }
    }
  }

  const searchRoots = configuredSearchRoots();
  const seen = new Set<string>();

  for (const root of searchRoots) {
    if (seen.has(root.id)) continue;
    seen.add(root.id);
    const hit = await findFolderNamedUnderParent(auth, root.id, customerName, {
      loose: root.source === 'hub' || root.source === 'client_jobs',
    });
    if (!hit) continue;
    await rememberCustomerFolder(job, hit.id);
    return { id: hit.id, name: hit.name, source: root.source };
  }

  for (const root of searchRoots) {
    try {
      const parents = await getDriveFolderParents(auth, root.id);
      for (const parentId of parents) {
        if (seen.has(parentId)) continue;
        seen.add(parentId);
        const hit = await findFolderNamedUnderParent(auth, parentId, customerName);
        if (!hit) continue;
        await rememberCustomerFolder(job, hit.id);
        return { id: hit.id, name: hit.name, source: 'sibling' };
      }
    } catch {
      // Parent listing is best-effort; keep searching.
    }
  }

  const sanitized = sanitizeDriveFileFolderName(customerName);
  const hits = (await findDriveFoldersByExactName(auth, sanitized)).filter(
    (h) => folderNameMatchesCustomer(h.name, customerName) && !looksLikeDriveJobFolderName(h.name),
  );
  if (hits.length === 0) return null;

  const preferred = hits.find((h) => h.parents.some((p) => seen.has(p))) ?? hits[0]!;
  await rememberCustomerFolder(job, preferred.id);
  return { id: preferred.id, name: preferred.name, source: 'search' };
}

export async function linkCustomerDriveFolderForJob(
  jobId: string,
  folderIdOrUrl: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const raw = folderIdOrUrl.trim();
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      gmailConnectionId: true,
      quickbooksCompanyId: true,
      quickbooksCustomerId: true,
    },
  });
  if (!job) return { ok: false, error: 'Job not found.' };

  if (!raw) {
    if (job.quickbooksCompanyId && job.quickbooksCustomerId) {
      await prisma.customerDriveFolder.deleteMany({
        where: {
          quickbooksCompanyId: job.quickbooksCompanyId,
          quickbooksCustomerId: job.quickbooksCustomerId,
        },
      });
    }
    return { ok: true, id: '', name: '' };
  }

  if (!job.quickbooksCompanyId || !job.quickbooksCustomerId) {
    return {
      ok: false,
      error: 'Sync from QuickBooks first so this ticket has a customer we can remember the folder for.',
    };
  }

  const folderId = parseGoogleDriveFolderId(raw);
  if (!folderId) return { ok: false, error: 'Invalid folder URL or ID.' };

  const auth = await authForJob(job);
  await assertDriveFolderAccessible(auth, folderId, 'Customer folder');
  const name = (await getDriveFileName(auth, folderId)) || 'Customer folder';
  await rememberCustomerFolder(job, folderId);
  await prisma.job.update({
    where: { id: jobId },
    data: { googleDriveLastError: null },
  });
  return { ok: true, id: folderId, name };
}
