import { NextRequest, NextResponse } from 'next/server';
import { scanYelpLeadEmails, YelpMailboxNotReadyError } from '@/lib/gmail/scan-yelp-lead-emails';
import { resolveYelpLeadMailboxState } from '@/lib/yelp/lead-mailbox';
import { parseDryRunQueryParam } from '@/lib/yelp/scan-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Gmail list + one fetch per message; 60s matches the assistant route's budget. */
export const maxDuration = 60;

function readOptions(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // Left undefined when absent so the scan applies its own adaptive default.
  const num = (key: string) => {
    const raw = sp.get(key);
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    mailboxEmail: sp.get('mailbox'),
    lookbackDays: num('days'),
    maxMessages: num('max'),
  };
}

/**
 * Preview by default. Pass dryRun=0 (or false/no) to write tickets the same way
 * POST does — `"0"` must not be treated as truthy. Requires a Dash session.
 */
export async function GET(req: NextRequest) {
  const opts = readOptions(req);
  const dryRun = parseDryRunQueryParam(req.nextUrl.searchParams.get('dryRun'), true);
  try {
    const result = await scanYelpLeadEmails({ ...opts, dryRun });
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
      yelp_created: String(result.counts.ticketsCreated),
      yelp_leads: String(result.counts.leadEmailsFound),
      yelp_existing: String(result.counts.alreadyImported),
      yelp_examined: String(result.counts.messagesExamined),
      yelp_truncated: result.truncated ? '1' : '0',
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
