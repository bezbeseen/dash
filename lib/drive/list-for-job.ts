import { prisma } from '@/lib/db/prisma';
import { listDriveFolderChildren, formatDriveUserError, type DriveFolderListItem } from '@/lib/drive/api';
import { getAuthForGoogleDrive } from '@/lib/drive/auth';

export async function listJobDriveFolderPreview(
  jobId: string,
  folderId?: string | null,
): Promise<{
  items: DriveFolderListItem[];
  listError: string | null;
}> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { googleDriveFolderId: true },
  });
  const id = folderId ?? job?.googleDriveFolderId;
  if (!job || !id) {
    return { items: [], listError: null };
  }
  try {
    const { auth } = await getAuthForGoogleDrive({
      probeFolderId: id,
      probeLabel: 'This ticket’s Drive folder',
    });
    const items = await listDriveFolderChildren(auth, id, 40);
    return { items, listError: null };
  } catch (e) {
    return { items: [], listError: formatDriveUserError(e) };
  }
}
