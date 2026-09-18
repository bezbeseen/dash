import { NextResponse } from 'next/server';
import {
  createTicketFromGmailThread,
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
    return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  }
}

function redirectTo(req: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, originOf(req)), 303);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const threadUrlOrId = String(form.get('threadUrlOrId') ?? '');
  const gmailConnectionId = String(form.get('gmailConnectionId') ?? '').trim();

  if (!gmailConnectionId) {
    return redirectTo(req, '/dashboard/prequoted?from_gmail_error=mailbox');
  }

  try {
    const result = await createTicketFromGmailThread({ threadUrlOrId, gmailConnectionId });
    return NextResponse.redirect(ticketUrlForGmailResult(originOf(req), result), 303);
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Could not use that Gmail link.';
    const msg =
      /cannot open this conversation|invalid id|Could not open that conversation|Couldn't open that conversation/i.test(
        raw,
      )
        ? 'Could not open that conversation in the connected mailboxes. Paste ⋮ Copy link from the account that has the mail.'
        : raw;
    const u = new URL('/dashboard/prequoted', originOf(req));
    u.searchParams.set('from_gmail_error', msg.slice(0, 280));
    return NextResponse.redirect(u, 303);
  }
}
