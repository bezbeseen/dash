import { NextRequest, NextResponse } from 'next/server';
import {
  resyncLinkedGmailThreads,
  THREAD_RESYNC_DEFAULT_MAX_JOBS,
} from '@/lib/gmail/match-threads-bulk';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Message and attachment downloads are the slow part, hence the small default batch. */
export const maxDuration = 60;

function readMaxJobs(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get('max');
  if (!raw) return THREAD_RESYNC_DEFAULT_MAX_JOBS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : THREAD_RESYNC_DEFAULT_MAX_JOBS;
}

/** Re-pulls messages and attachments for the most recently touched linked tickets. */
export async function POST(req: NextRequest) {
  const maxJobs = readMaxJobs(req);
  const settings = (query: string) =>
    NextResponse.redirect(new URL(`/dashboard/settings?${query}`, req.nextUrl.origin), 303);

  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');

  try {
    const result = await resyncLinkedGmailThreads({ maxJobs });
    if (wantsJson) {
      return NextResponse.json({ ok: true, ...result });
    }
    const q = new URLSearchParams({
      thread_resync: '1',
      thread_resynced: String(result.succeeded),
      thread_resync_failed: String(result.failed),
    });
    return settings(q.toString());
  } catch (e) {
    const message = e instanceof Error ? e.message : 'resync_failed';
    if (wantsJson) {
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
    return settings(new URLSearchParams({ thread_match_error: message.slice(0, 400) }).toString());
  }
}
