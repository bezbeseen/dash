import { NextResponse } from 'next/server';
import { EventSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { syncGmailThreadForJob } from '@/lib/gmail/sync-thread';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  try {
    const { messages, files } = await syncGmailThreadForJob(jobId);

    await prisma.activityLog.create({
      data: {
        jobId,
        source: EventSource.APP,
        eventName: 'gmail.thread_synced',
        message: `Synced Gmail thread: ${messages} message(s), ${files} new attachment file(s) downloaded.`,
      },
    });

    const u = postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`);
    u.searchParams.set('gmail_synced', '1');
    return NextResponse.redirect(u);
  } catch (e) {
    const msg = e instanceof Error ? encodeURIComponent(e.message) : 'sync_failed';
    const u = postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`);
    u.searchParams.set('gmail_sync_error', msg);
    return NextResponse.redirect(u);
  }
}
