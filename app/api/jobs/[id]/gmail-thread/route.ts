import { NextResponse } from 'next/server';
import { EventSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  extractRfc822MsgIdForSearch,
  parseGmailThreadId,
  sanitizeGmailPaste,
} from '@/lib/gmail/parse-thread-id';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const form = await req.formData();
  const raw = sanitizeGmailPaste(String(form.get('threadUrlOrId') ?? ''));
  const parsed = parseGmailThreadId(raw);
  const looksLikeMailLink = /^https:\/\/mail\.google\.com\//i.test(raw);
  const looksLikeBareToken = /^[a-zA-Z0-9_-]+$/.test(raw) && raw.length >= 8;
  const looksLikeRfc822 = extractRfc822MsgIdForSearch(raw) != null;

  // Store the full pasted string (like "seed email" stores the URL). Sync resolves URL → API id.
  if (!parsed && !looksLikeMailLink && !looksLikeBareToken && !looksLikeRfc822) {
    console.error('[gmail/thread] rejected input', {
      raw,
      parsed,
      looksLikeMailLink,
      looksLikeBareToken,
      looksLikeRfc822,
    });
    const u = postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`);
    u.searchParams.set('gmail_thread_error', '1');
    return NextResponse.redirect(u);
  }

  let mailboxId = String(form.get('gmailConnectionId') ?? '').trim();
  if (!mailboxId) {
    const only = await prisma.gmailConnection.findMany({ orderBy: { googleEmail: 'asc' } });
    if (only.length === 1) mailboxId = only[0].id;
  }
  if (!mailboxId) {
    const u = postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`);
    u.searchParams.set('gmail_mailbox_error', '1');
    return NextResponse.redirect(u);
  }

  const mailbox = await prisma.gmailConnection.findUnique({ where: { id: mailboxId } });
  if (!mailbox) {
    const u = postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`);
    u.searchParams.set('gmail_mailbox_error', '1');
    return NextResponse.redirect(u);
  }

  await prisma.job.update({
    where: { id: jobId },
    data: { gmailThreadId: raw, gmailConnectionId: mailboxId },
  });

  const logSnippet = raw.length > 48 ? `${raw.slice(0, 48)}…` : raw;
  await prisma.activityLog.create({
    data: {
      jobId,
      source: EventSource.APP,
      eventName: 'gmail.thread_set',
      message: `Gmail thread saved (${mailbox.googleEmail}) — ${logSnippet}. Sync to pull messages and files.`,
    },
  });

  return NextResponse.redirect(postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`));
}
