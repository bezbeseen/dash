import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSessionEmail } from '@/lib/auth-session';
import { getAuthForGoogleDrive } from '@/lib/drive/auth';
import { driveItemIsUnderFolder, loadDrivePreviewImage } from '@/lib/drive/list-for-job';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    await requireSessionEmail();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id, fileId } = await params;
  if (!fileId) {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
  }

  const job = await prisma.job.findUnique({
    where: { id },
    select: { googleDriveFolderId: true },
  });
  if (!job?.googleDriveFolderId) {
    return NextResponse.json({ error: 'No job folder on this ticket.' }, { status: 404 });
  }

  const fallback = new NextResponse(
    new Uint8Array(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#eef2f5"/></svg>`,
      ),
    ),
    {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=60' },
    },
  );

  try {
    const { auth } = await getAuthForGoogleDrive({
      probeFolderId: job.googleDriveFolderId,
      probeLabel: 'This ticket’s Drive folder',
    });
    const allowed = await driveItemIsUnderFolder(auth, fileId, job.googleDriveFolderId);
    if (!allowed) return fallback;
    const image = await loadDrivePreviewImage(auth, fileId);
    return new NextResponse(new Uint8Array(image.body), {
      status: 200,
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return fallback;
  }
}
