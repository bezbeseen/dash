import { EventSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { formatDriveUserError, findDriveChildByName, downloadDriveFileBuffer, uploadOrReplaceDriveFile } from '@/lib/drive/api';
import { getAuthForGoogleDrive } from '@/lib/drive/auth';
import { createJobFolderFromTemplate } from '@/lib/drive/create-job-folder-from-template';
import { getJobFolderTemplateId } from '@/lib/drive/config';
import {
  isProjectBookPayload,
  PROJECT_BOOK_FILE_NAME,
  seedProjectBookFromJob,
  type ProjectBookPayload,
} from '@/lib/domain/project-book';

export type ProjectBookFileResult = {
  project: ProjectBookPayload;
  exists: boolean;
  folderId: string;
  fileId: string | null;
  webViewLink: string | null;
};

async function jobForBook(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      customerName: true,
      projectName: true,
      projectDescription: true,
      inboundLeadKind: true,
      googleDriveFolderId: true,
    },
  });
}

export async function ensureJobFolderForProjectBook(jobId: string): Promise<
  { ok: true; folderId: string } | { ok: false; error: string }
> {
  const job = await jobForBook(jobId);
  if (!job) return { ok: false, error: 'Ticket not found.' };
  if (job.googleDriveFolderId) return { ok: true, folderId: job.googleDriveFolderId };

  if (!getJobFolderTemplateId()) {
    return {
      ok: false,
      error: 'Create or link a job folder on this ticket first, then make the project book.',
    };
  }
  const created = await createJobFolderFromTemplate(jobId);
  if (!created.ok) return created;
  return { ok: true, folderId: created.folderId };
}

export async function loadProjectBookForJob(jobId: string): Promise<
  { ok: true; data: ProjectBookFileResult } | { ok: false; error: string }
> {
  const job = await jobForBook(jobId);
  if (!job) return { ok: false, error: 'Ticket not found.' };
  const seed = seedProjectBookFromJob(job);
  if (!job.googleDriveFolderId) {
    return {
      ok: true,
      data: {
        project: seed,
        exists: false,
        folderId: '',
        fileId: null,
        webViewLink: null,
      },
    };
  }

  try {
    const { auth } = await getAuthForGoogleDrive({
      probeFolderId: job.googleDriveFolderId,
      probeLabel: 'This ticket’s Drive folder',
    });
    const fileId = await findDriveChildByName(auth, job.googleDriveFolderId, PROJECT_BOOK_FILE_NAME);
    if (!fileId) {
      return {
        ok: true,
        data: {
          project: seed,
          exists: false,
          folderId: job.googleDriveFolderId,
          fileId: null,
          webViewLink: null,
        },
      };
    }
    const buf = await downloadDriveFileBuffer(auth, fileId);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(buf.toString('utf8'));
    } catch {
      parsed = null;
    }
    const project = isProjectBookPayload(parsed) ? parsed : seed;
    return {
      ok: true,
      data: {
        project,
        exists: true,
        folderId: job.googleDriveFolderId,
        fileId,
        webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      },
    };
  } catch (e) {
    return { ok: false, error: formatDriveUserError(e) };
  }
}

export async function saveProjectBookForJob(
  jobId: string,
  project: ProjectBookPayload,
  opts?: { created?: boolean },
): Promise<{ ok: true; data: ProjectBookFileResult } | { ok: false; error: string }> {
  const folder = await ensureJobFolderForProjectBook(jobId);
  if (!folder.ok) return folder;

  try {
    const { auth } = await getAuthForGoogleDrive({
      probeFolderId: folder.folderId,
      probeLabel: 'This ticket’s Drive folder',
    });
    const json = Buffer.from(JSON.stringify(project, null, 2), 'utf8');
    if (json.length > 4_000_000) {
      return { ok: false, error: 'Project book is too large to save (images). Remove a few photos and try again.' };
    }
    const uploaded = await uploadOrReplaceDriveFile(
      auth,
      folder.folderId,
      PROJECT_BOOK_FILE_NAME,
      'application/json',
      json,
    );
    if (opts?.created) {
      await prisma.activityLog.create({
        data: {
          jobId,
          source: EventSource.APP,
          eventName: 'project_book.created',
          message: `Project book saved to the job folder (${PROJECT_BOOK_FILE_NAME}).`,
        },
      });
    }
    return {
      ok: true,
      data: {
        project,
        exists: true,
        folderId: folder.folderId,
        fileId: uploaded.id || null,
        webViewLink: uploaded.webViewLink,
      },
    };
  } catch (e) {
    return { ok: false, error: formatDriveUserError(e) };
  }
}

export async function makeProjectBookForJob(jobId: string): Promise<
  { ok: true; data: ProjectBookFileResult; created: boolean } | { ok: false; error: string }
> {
  const loaded = await loadProjectBookForJob(jobId);
  if (!loaded.ok) return loaded;
  if (loaded.data.exists) return { ok: true, data: loaded.data, created: false };

  const saved = await saveProjectBookForJob(jobId, loaded.data.project, { created: true });
  if (!saved.ok) return saved;
  return { ok: true, data: saved.data, created: true };
}
