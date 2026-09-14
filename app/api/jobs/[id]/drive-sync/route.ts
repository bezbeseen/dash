import { NextResponse } from 'next/server';
import { formatDriveUserError } from '@/lib/drive/api';
import { postActionRedirect } from '@/lib/http/post-action-redirect';
import { syncJobDriveFolder } from '@/lib/drive/sync-job-folder';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await syncJobDriveFolder(id);
    if (!result.ok) {
      return NextResponse.redirect(
        postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_error=${encodeURIComponent(result.error)}`),
      );
    }
    if ('pdfsSaved' in result) {
      return NextResponse.redirect(
        postActionRedirect(
          req,
          id,
          `/dashboard/jobs/${id}?drive_sync_ok=pdfs&drive_folder=${encodeURIComponent(result.folderName)}`,
        ),
      );
    }
    if ('skipped' in result) {
      if (result.reason === 'not_configured') {
        return NextResponse.redirect(
          postActionRedirect(
            req,
            id,
            `/dashboard/jobs/${id}?drive_error=${encodeURIComponent('Set GOOGLE_DRIVE_*_FOLDER_ID in .env for Active, Completed, and Archive.')}`,
          ),
        );
      }
      if (result.reason === 'no_folder') {
        return NextResponse.redirect(
          postActionRedirect(
            req,
            id,
            `/dashboard/jobs/${id}?drive_error=${encodeURIComponent('No job folder linked and no matching customer folder in Drive.')}`,
          ),
        );
      }
      return NextResponse.redirect(postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_sync_ok=already`));
    }
    return NextResponse.redirect(postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_sync_ok=moved`));
  } catch (e) {
    return NextResponse.redirect(
      postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_error=${encodeURIComponent(formatDriveUserError(e))}`),
    );
  }
}
