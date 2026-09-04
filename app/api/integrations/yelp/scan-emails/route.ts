import { NextRequest, NextResponse } from 'next/server';
import {
  scanYelpLeadEmails,
  YelpMailboxNotReadyError,
  YELP_SCAN_DEFAULT_LOOKBACK_DAYS,
  YELP_SCAN_DEFAULT_MAX_MESSAGES,
} from '@/lib/gmail/scan-yelp-lead-emails';
import { resolveYelpLeadMailboxState } from '@/lib/yelp/lead-mailbox';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Gmail list + one fetch per message; 60s matches the assistant route's budget. */
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
    mailboxEmail: sp.get('mailbox'),
    lookbackDays: num('days', YELP_SCAN_DEFAULT_LOOKBACK_DAYS),
    maxMessages: num('max', YELP_SCAN_DEFAULT_MAX_MESSAGES),
  };
}

/**
 * Dry-run preview. Shows which Yelp emails Dash would import and what it parsed
 * out of them, without writing any tickets. Requires a Dash session (middleware).
 */
export async function GET(req: NextRequest) {
  const opts = readOptions(req);
  try {
    const result = await scanYelpLeadEmails({ ...opts, dryRun: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof YelpMailboxNotReadyError) {
      return NextResponse.json(
        { ok: false, error: 'mailbox_not_connected', reason: e.message, mailbox: e.state },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : 'scan_failed';
    return NextResponse.json(
      { ok: false, error: message, mailbox: await resolveYelpLeadMailboxState(opts.mailboxEmail) },
      { status: 502 },
    );
  }
}

/** Imports new Yelp lead emails as pre-quote tickets, then returns to Settings. */
export async function POST(req: NextRequest) {
  const opts = readOptions(req);
  const settings = (query: string) =>
    NextResponse.redirect(new URL(`/dashboard/settings?${query}`, req.nextUrl.origin), 303);

  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');

  try {
    const result = await scanYelpLeadEmails({ ...opts, dryRun: false });
    if (wantsJson) {
      return NextResponse.json({ ok: true, ...result });
    }
    const q = new URLSearchParams({
      yelp_scan: '1',
      yelp_created: String(result.createdJobIds.length),
      yelp_matched: String(result.matched),
      yelp_scanned: String(result.scanned),
    });
    return settings(q.toString());
  } catch (e) {
    if (e instanceof YelpMailboxNotReadyError) {
      if (wantsJson) {
        return NextResponse.json(
          { ok: false, error: 'mailbox_not_connected', reason: e.message, mailbox: e.state },
          { status: 409 },
        );
      }
      return settings(new URLSearchParams({ yelp_scan_error: e.message.slice(0, 400) }).toString());
    }
    const message = e instanceof Error ? e.message : 'scan_failed';
    if (wantsJson) {
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
    const q = new URLSearchParams({ yelp_scan_error: message.slice(0, 400) });
    return settings(q.toString());
  }
}
