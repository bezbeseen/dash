import { NextResponse } from 'next/server';
import { formatDriveUserError } from '@/lib/drive/api';
import { postActionRedirect } from '@/lib/http/post-action-redirect';
import { linkCustomerDriveFolderForJob } from '@/lib/drive/resolve-customer-folder';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const form = await req.formData();
    const raw = String(form.get('folderIdOrUrl') ?? '');
    const result = await linkCustomerDriveFolderForJob(id, raw);
    if (!result.ok) {
      return NextResponse.redirect(
        postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_error=${encodeURIComponent(result.error)}`),
      );
    }
    return NextResponse.redirect(postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_saved=customer`));
  } catch (e) {
    return NextResponse.redirect(
      postActionRedirect(req, id, `/dashboard/jobs/${id}?drive_error=${encodeURIComponent(formatDriveUserError(e))}`),
    );
  }
}
