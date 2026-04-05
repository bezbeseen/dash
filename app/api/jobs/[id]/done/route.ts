import { NextResponse } from 'next/server';
import { ArchiveReason } from '@prisma/client';
import { archiveJob } from '@/lib/domain/sync';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await archiveJob(id, ArchiveReason.DONE, 'Marked Done — ticket removed from the board.');
  } catch {
    return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/tickets?job_error=archive'));
  }
  return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/tickets'));
}
