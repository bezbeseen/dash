import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ArchiveReason } from '@prisma/client';
import { archiveJob } from '@/lib/domain/sync';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await archiveJob(id, ArchiveReason.DISMISSED, 'Dismissed — thin / low-intent pre-quote lead.');
  } catch {
    return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/prequoted?job_error=archive'));
  }
  revalidatePath('/dashboard/prequoted');
  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/jobs/${id}`);
  return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/prequoted'));
}
