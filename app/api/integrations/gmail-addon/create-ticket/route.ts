import { NextResponse } from 'next/server';
import { gmailAddonAuthorized, gmailAddonSecret } from '@/lib/gmail/addon-auth';
import {
  createTicketFromGmailAddon,
  ticketUrlForGmailResult,
} from '@/lib/gmail/create-ticket-from-thread';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function originOf(req: Request): string {
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickStr(body: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      'Dash Gmail add-on. POST JSON { threadId, messageId, mailboxEmail, ticketLabel } with Authorization: Bearer <GMAIL_ADDON_SECRET> (Vercel). Apps Script property is DASH_ADDON_SECRET — do not create DASH_ADDON_SECRET on Vercel.',
  });
}

/**
 * Called from the Apps Script Gmail add-on while a conversation is open.
 * `threadId` is Gmail’s API id (not an FMfcgz Copy-link token).
 */
export async function POST(req: Request) {
  const secret = gmailAddonSecret();
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'GMAIL_ADDON_SECRET is not set on the server. Add that name on Vercel (Production), then Redeploy. Do not create DASH_ADDON_SECRET on Vercel — that name is only the Apps Script property.',
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown> = {};
  let jsonOk = false;
  try {
    const parsed = asRecord(await req.json());
    if (parsed) body = parsed;
    jsonOk = true;
  } catch {
    jsonOk = false;
  }

  if (!gmailAddonAuthorized(req, secret, body)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'addon_secret_mismatch: Authorization Bearer / X-Dash-Addon-Secret / body addonSecret did not match GMAIL_ADDON_SECRET.',
      },
      { status: 401 },
    );
  }
  if (!jsonOk) {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const threadId = pickStr(body, 'threadId', 'thread_id');
  const messageId = pickStr(body, 'messageId', 'message_id');
  const mailboxEmail = pickStr(body, 'mailboxEmail', 'mailbox_email', 'email');
  const ticketLabel = pickStr(body, 'ticketLabel', 'ticket_label', 'label');

  if (!threadId && !messageId) {
    return NextResponse.json({ ok: false, error: 'missing_thread_id' }, { status: 400 });
  }

  try {
    const result = await createTicketFromGmailAddon({ threadId, messageId, mailboxEmail, ticketLabel });
    const ticketUrl = ticketUrlForGmailResult(originOf(req), result);
    return NextResponse.json({
      ok: true,
      jobId: result.jobId,
      ticketUrl,
      existed: result.existed,
      restored: Boolean(result.restored),
      usedQuickBooks: result.usedQuickBooks,
      customerCreated: result.customerCreated,
      qboError: result.qboError,
      syncError: result.syncError,
      bookmarkOnly: result.bookmarkOnly,
      customerName: result.customerName ?? null,
      ticketLabel: result.ticketLabel ?? null,
      estimateNumber: result.estimateNumber ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not create a ticket from this conversation.';
    return NextResponse.json({ ok: false, error: message.slice(0, 280) }, { status: 502 });
  }
}
