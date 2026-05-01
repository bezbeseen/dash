import { NextResponse } from 'next/server';
import { formatDriveUserError } from '@/lib/drive/api';
import { createJobFolderFromTemplate } from '@/lib/drive/create-job-folder-from-template';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await createJobFolderFromTemplate(id);
    if (!result.ok) {
      return NextResponse.redirect(
        postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_error=${encodeURIComponent(result.error)}`),
      );
    }
    return NextResponse.redirect(postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_created=1`));
  } catch (e) {
    return NextResponse.redirect(
      postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_error=${encodeURIComponent(formatDriveUserError(e))}`),
    );
  }
}
