import { prisma } from '@/lib/db/prisma';
import {
  assertDriveFolderAccessible,
  getDriveFileName,
} from '@/lib/drive/api';
import {
  getClientJobsRootFolderId,
  getCustomerHubFolderId,
} from '@/lib/drive/config';
import { findFolderNamedUnderParent } from '@/lib/drive/ensure-customer-subfolder';
import { parseGoogleDriveFolderId } from '@/lib/drive/parse-folder-id';
import { getAuthForGoogleDrive } from '@/lib/drive/auth';

export type ResolvedCustomerDriveFolder = {
  id: string;
  name: string;
  source: 'saved' | 'hub' | 'client_jobs';
};

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
  quickbooksCompanyId: string | null;
  quickbooksCustomerId: string | null;
};

function configuredSearchRoots(): { id: string; source: ResolvedCustomerDriveFolder['source'] }[] {
  const searchRoots: { id: string; source: ResolvedCustomerDriveFolder['source'] }[] = [];
  const hub = getCustomerHubFolderId();
  if (hub) searchRoots.push({ id: hub, source: 'hub' });
  const clientJobs = getClientJobsRootFolderId();
  if (clientJobs) searchRoots.push({ id: clientJobs, source: 'client_jobs' });
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

  const { auth } = await getAuthForGoogleDrive();

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

  return null;
}

export async function linkCustomerDriveFolderForJob(
  jobId: string,
  folderIdOrUrl: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const raw = folderIdOrUrl.trim();
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
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

  const { auth } = await getAuthForGoogleDrive();
  await assertDriveFolderAccessible(auth, folderId, 'Customer folder');
  const name = (await getDriveFileName(auth, folderId)) || 'Customer folder';
  await rememberCustomerFolder(job, folderId);
  await prisma.job.update({
    where: { id: jobId },
    data: { googleDriveLastError: null },
  });
  return { ok: true, id: folderId, name };
}
