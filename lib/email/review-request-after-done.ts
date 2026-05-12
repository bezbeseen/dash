import type { Job } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { fetchInvoiceById } from '@/lib/quickbooks/client';
import { jobDisplayTitle } from '@/lib/domain/job-display';
import { getGmailOAuth2ClientForSendMailbox } from '@/lib/gmail/tokens-db';
import { buildHtmlRfc822Message, gmailSendRfc822 } from '@/lib/gmail/send-rfc822';

/** Default mailbox that must appear in Settings → Gmail (same as typical `contact@` sender). */
const DEFAULT_SEND_AS = 'contact@beseensignshop.com';

export function reviewRequestEmailFeatureEnabled(): boolean {
  const v = (process.env.REVIEW_REQUEST_EMAIL_ENABLED ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return true;
}

export function getReviewRequestSendAsEmail(): string {
  return (process.env.REVIEW_REQUEST_SEND_AS_EMAIL ?? DEFAULT_SEND_AS).trim().toLowerCase() || DEFAULT_SEND_AS;
}

/** True when the send-as address is connected in Dash (Gmail OAuth). */
export async function reviewRequestGmailMailboxConnected(): Promise<boolean> {
  if (!reviewRequestEmailFeatureEnabled()) return false;
  const email = getReviewRequestSendAsEmail();
  const row = await prisma.gmailConnection.findFirst({
    where: { googleEmail: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  return Boolean(row);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function resolveRealmId(job: Pick<Job, 'quickbooksCompanyId'>): Promise<string | null> {
  if (job.quickbooksCompanyId?.trim()) return job.quickbooksCompanyId.trim();
  const row = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { realmId: true },
  });
  return row?.realmId ?? null;
}

async function resolveBillToEmail(
  job: Pick<Job, 'quickbooksCompanyId' | 'quickbooksInvoiceId'>,
): Promise<string | null> {
  if (!job.quickbooksInvoiceId?.trim()) return null;
  const realmId = await resolveRealmId(job);
  if (!realmId) return null;
  try {
    const inv = await fetchInvoiceById(realmId, job.quickbooksInvoiceId);
    const to = inv.billEmail?.trim();
    return to || null;
  } catch {
    return null;
  }
}

function buildBodies(params: { customerName: string; projectLabel: string; reviewUrl: string | null }): {
  subject: string;
  html: string;
  text: string;
} {
  const who = escapeHtml(params.customerName.trim());
  const label = escapeHtml(params.projectLabel.trim());
  const subject = `Thanks, ${params.customerName.trim()} — quick favor?`;
  const linkBlock =
    params.reviewUrl != null && params.reviewUrl.trim().length > 0
      ? `<p style="margin:16px 0;"><a href="${escapeHtml(params.reviewUrl.trim())}" style="display:inline-block;padding:10px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Leave a review</a></p><p style="margin:0;font-size:14px;color:#4b5563;">Or paste this link into your browser:<br/><span style="word-break:break-all;">${escapeHtml(params.reviewUrl.trim())}</span></p>`
      : `<p style="margin:16px 0;font-size:15px;color:#374151;">If you are happy with our work, we would be grateful for a short review on Google or Yelp — whichever you use most.</p>`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0;padding:24px;">
<p>Hi ${who},</p>
<p>We have wrapped up <strong>${label}</strong>. Thank you for choosing Be Seen.</p>
<p>If everything looked good, would you take a minute to leave us a review? It helps other businesses find us.</p>
${linkBlock}
<p style="margin-top:24px;">Thank you again,<br/>Be Seen</p>
<p style="font-size:13px;color:#6b7280;">Questions? Reply to this email or write to <a href="mailto:${escapeHtml(getReviewRequestSendAsEmail())}">${escapeHtml(getReviewRequestSendAsEmail())}</a>.</p>
</body></html>`;

  const sendAs = getReviewRequestSendAsEmail();
  const textLines = [
    `Hi ${params.customerName.trim()},`,
    '',
    `We have wrapped up ${params.projectLabel.trim()}. Thank you for choosing Be Seen.`,
    '',
    `If everything looked good, would you take a minute to leave us a review? It helps other businesses find us.`,
    '',
    params.reviewUrl?.trim()
      ? `Leave a review: ${params.reviewUrl.trim()}`
      : 'If you are happy with our work, we would be grateful for a short review on Google or Yelp.',
    '',
    'Thank you again,',
    'Be Seen',
    '',
    `Questions? Reply to this email or write to ${sendAs}.`,
  ];

  return { subject, html, text: textLines.join('\n') };
}

/**
 * After a ticket is marked Done, optionally email the customer (invoice Bill email) asking for a review.
 * Sends via **Gmail API** using the connected mailbox `REVIEW_REQUEST_SEND_AS_EMAIL` (default `contact@beseensignshop.com`).
 *
 * Requires Gmail OAuth to include **send** scope — reconnect that mailbox in Settings after upgrading Dash.
 *
 * Env:
 * - `REVIEW_REQUEST_EMAIL_ENABLED` — optional; `0` / `false` / `off` disables.
 * - `REVIEW_REQUEST_SEND_AS_EMAIL` — optional; default `contact@beseensignshop.com` (must match a row in Settings → Gmail).
 * - `REVIEW_REQUEST_REVIEW_URL` — optional review link (e.g. Google) for a button in the HTML.
 */
export async function sendReviewRequestEmailAfterJobDone(job: Job): Promise<void> {
  if (!reviewRequestEmailFeatureEnabled()) return;
  if (job.reviewRequestEmailSentAt != null) return;

  const sendAs = getReviewRequestSendAsEmail();
  let oauth2;
  try {
    oauth2 = await getGmailOAuth2ClientForSendMailbox(sendAs);
  } catch {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[review-request-email] skipped: Gmail not connected for', sendAs);
    }
    return;
  }

  const to = await resolveBillToEmail(job);
  if (!to) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[review-request-email] skipped: no invoice bill email for job', job.id);
    }
    return;
  }

  const reviewUrl = (process.env.REVIEW_REQUEST_REVIEW_URL ?? '').trim() || null;
  const projectLabel = jobDisplayTitle(job);

  const { subject, html, text } = buildBodies({
    customerName: job.customerName,
    projectLabel,
    reviewUrl,
  });

  const fromHeader = `Be Seen <${sendAs}>`;
  const rfc822 = buildHtmlRfc822Message({
    from: fromHeader,
    to,
    subject,
    html,
    text,
  });

  await gmailSendRfc822(oauth2, rfc822);

  await prisma.job.update({
    where: { id: job.id },
    data: { reviewRequestEmailSentAt: new Date() },
  });
}
