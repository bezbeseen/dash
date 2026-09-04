import { NextRequest, NextResponse } from 'next/server';
import {
  scanJobsForGmailThreads,
  THREAD_MATCH_SCAN_DEFAULT_MAX_JOBS,
} from '@/lib/gmail/match-threads-bulk';
import { THREAD_MATCH_DEFAULT_LOOKBACK_DAYS } from '@/lib/gmail/thread-match';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Up to six Gmail round trips per ticket; matches the other Gmail scan routes' budget. */
export const maxDuration = 60;

function readOptions(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const num = (key: string, fallback: number) => {
    const raw = sp.get(key);
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    maxJobs: num('max', THREAD_MATCH_SCAN_DEFAULT_MAX_JOBS),
    lookbackDays: num('days', THREAD_MATCH_DEFAULT_LOOKBACK_DAYS),
  };
}

/**
 * Dry-run preview. Shows, per ticket, which addresses Dash searched on, which threads came back,
 * how each scored, and whether it would attach or only suggest. Writes nothing.
 */
export async function GET(req: NextRequest) {
  const opts = readOptions(req);
  try {
    const result = await scanJobsForGmailThreads({ ...opts, dryRun: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'match_failed';
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: 'Connect at least one mailbox under Settings → Gmail, then try the preview again.',
      },
      { status: 502 },
    );
  }
}

/** Attaches unambiguous matches and leaves suggestions on the rest, then returns to Settings. */
export async function POST(req: NextRequest) {
  const opts = readOptions(req);
  const settings = (query: string) =>
    NextResponse.redirect(new URL(`/dashboard/settings?${query}`, req.nextUrl.origin), 303);

  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');

  try {
    const result = await scanJobsForGmailThreads({ ...opts, dryRun: false });
    if (wantsJson) {
      return NextResponse.json({ ok: true, ...result });
    }
    const q = new URLSearchParams({
      thread_match: '1',
      thread_linked: String(result.linked),
      thread_suggested: String(result.suggested),
      thread_scanned: String(result.scanned),
    });
    return settings(q.toString());
  } catch (e) {
    const message = e instanceof Error ? e.message : 'match_failed';
    if (wantsJson) {
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
    return settings(new URLSearchParams({ thread_match_error: message.slice(0, 400) }).toString());
  }
}
