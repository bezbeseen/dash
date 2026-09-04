import { NextResponse } from 'next/server';
import { EventSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Detaches the thread and drops what was pulled from it. Messages synced from a wrong match are
 * the whole reason unlinking exists, so leaving them behind would defeat the point.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, gmailThreadId: true, gmailLinkSource: true, gmailLinkConfidence: true },
  });
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const u = postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`);
  u.hash = 'ticket-gmail';

  if (!job.gmailThreadId) {
    u.searchParams.set('gmail_match', 'not_linked');
    return NextResponse.redirect(u);
  }

  const removed = await prisma.gmailSyncedMessage.deleteMany({ where: { jobId } });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      gmailThreadId: null,
      gmailLinkSource: null,
      gmailLinkedAt: null,
      gmailLinkConfidence: null,
    },
  });

  await prisma.activityLog.create({
    data: {
      jobId,
      source: EventSource.APP,
      eventName: 'gmail.thread_unlinked',
      message: `Gmail thread detached; removed ${removed.count} synced message(s) from this ticket.`,
      metadata: {
        threadId: job.gmailThreadId,
        previousLinkSource: job.gmailLinkSource,
        previousConfidence: job.gmailLinkConfidence,
        removedMessages: removed.count,
      },
    },
  });

  u.searchParams.set('gmail_match', 'unlinked');
  return NextResponse.redirect(u);
}
