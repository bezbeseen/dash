import { EventSource } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { postActionRedirect } from '@/lib/http/post-action-redirect';
import { YELP_LEADS_DENIED_MESSAGE } from '@/lib/yelp/leads-api';
import { syncYelpBizConversationForJob } from '@/lib/yelp/sync-lead-conversation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, yelpLeadId: true },
  });
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const u = postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`);
  u.hash = 'ticket-correspondence';

  if (!job.yelpLeadId) {
    u.searchParams.set('yelp_sync_error', 'This ticket has no Yelp conversation id.');
    return NextResponse.redirect(u);
  }

  try {
    const result = await syncYelpBizConversationForJob(jobId);
    if (!result.ok) {
      if (result.code === 'denied') {
        u.searchParams.set('yelp_sync_denied', '1');
      } else {
        u.searchParams.set('yelp_sync_error', result.message.slice(0, 400));
      }
      return NextResponse.redirect(u);
    }

    await prisma.activityLog.create({
      data: {
        jobId,
        source: EventSource.APP,
        eventName: 'yelp.conversation_refresh',
        message: `Refresh Yelp conversation: ${result.inserted} new of ${result.fetched} message(s).`,
        metadata: {
          apiLeadId: result.apiLeadId,
          conversationId: result.conversationId,
          fetched: result.fetched,
          inserted: result.inserted,
          resolvedVia: result.resolvedVia,
        },
      },
    });

    u.searchParams.set('yelp_synced', '1');
    u.searchParams.set('yelp_synced_count', String(result.inserted));
    return NextResponse.redirect(u);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'sync_failed';
    const denied = msg.includes('403') || msg.includes(YELP_LEADS_DENIED_MESSAGE);
    if (denied) {
      u.searchParams.set('yelp_sync_denied', '1');
    } else {
      u.searchParams.set('yelp_sync_error', msg.slice(0, 400));
    }
    return NextResponse.redirect(u);
  }
}
