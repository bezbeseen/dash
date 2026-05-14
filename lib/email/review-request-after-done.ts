import type { Job } from '@prisma/client';
import { EventSource } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
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

/** Only http(s) URLs are allowed in href/src after substitution. */
function safeHttpUrl(u: string): string {
  const t = u.trim();
  if (!t) return '';
  try {
    const parsed = new URL(t);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s);
}

const DEFAULT_REVIEW_LOGO_URL = 'https://getbeseen.com/assets/images/logo/BeSeen_1.png';
const DEFAULT_REVIEW_BG_URL =
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1400&q=75';
const DEFAULT_YELP_REVIEW_URL = 'https://www.yelp.com/biz/be-seen-print-sign-and-design-santa-clara';

let cachedReviewEmailHtmlTemplate: string | null = null;

function reviewRequestEmailTemplatePaths(): string[] {
  const custom = process.env.REVIEW_REQUEST_EMAIL_TEMPLATE_PATH?.trim();
  return [
    ...(custom ? [custom] : []),
    path.join(process.cwd(), 'email.html'),
    path.join(process.cwd(), 'lib/email/templates/review-request.html'),
  ];
}

async function loadReviewRequestEmailHtmlTemplate(): Promise<string> {
  if (cachedReviewEmailHtmlTemplate && process.env.NODE_ENV === 'production') {
    return cachedReviewEmailHtmlTemplate;
  }
  const tried: string[] = [];
  for (const filePath of reviewRequestEmailTemplatePaths()) {
    try {
      const html = await readFile(filePath, 'utf-8');
      if (process.env.NODE_ENV === 'production') cachedReviewEmailHtmlTemplate = html;
      return html;
    } catch (e) {
      tried.push(`${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(
    `[review-request-email] No HTML template found. Tried:\n${tried.join(
      '\n',
    )}\nAdd email.html at the project root, lib/email/templates/review-request.html, or set REVIEW_REQUEST_EMAIL_TEMPLATE_PATH.`,
  );
}

function applyReviewEmailTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    out = out.split(`{{${key}}}`).join(vars[key] ?? '');
  }
  const leftover = out.match(/\{\{[a-z0-9_]+\}\}/gi);
  if (leftover?.length) {
    console.warn('[review-request-email] unreplaced template tokens:', [...new Set(leftover)].slice(0, 12).join(', '));
  }
  return out;
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
): Promise<{ to: string | null; skipReason: string | null }> {
  if (!job.quickbooksInvoiceId?.trim()) {
    return { to: null, skipReason: 'No QuickBooks invoice on this ticket.' };
  }
  const realmId = await resolveRealmId(job);
  if (!realmId) {
    return { to: null, skipReason: 'QuickBooks is not connected (no company token).' };
  }
  try {
    const inv = await fetchInvoiceById(realmId, job.quickbooksInvoiceId);
    const to = inv.billEmail?.trim();
    if (!to) {
      return {
        to: null,
        skipReason:
          'Invoice has no Bill email in QuickBooks. Add Bill email on the invoice in QBO, run Sync from QuickBooks, then mark Done on a ticket that still has the invoice.',
      };
    }
    return { to, skipReason: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { to: null, skipReason: `Could not load invoice from QuickBooks: ${msg.slice(0, 400)}` };
  }
}

async function logReviewEmailActivity(jobId: string, eventName: string, message: string) {
  try {
    await prisma.activityLog.create({
      data: {
        jobId,
        source: EventSource.APP,
        eventName,
        message: message.slice(0, 8000),
      },
    });
  } catch (e) {
    console.error('[review-request-email] activity log failed', e);
  }
}

function resolveReviewEmailLinks(): {
  googleReviewUrl: string | null;
  googlePageUrl: string | null;
  yelpPageUrl: string | null;
} {
  const googleReview = (process.env.REVIEW_REQUEST_REVIEW_URL ?? '').trim() || null;
  const googlePage =
    (process.env.NEXT_PUBLIC_GOOGLE_BUSINESS_INSIGHTS_URL ?? '').trim() ||
    (process.env.NEXT_PUBLIC_GOOGLE_BUSINESS_URL ?? '').trim() ||
    null;
  const yelpPage =
    (process.env.NEXT_PUBLIC_YELP_INSIGHTS_URL ?? '').trim() ||
    (process.env.NEXT_PUBLIC_YELP_URL ?? '').trim() ||
    null;

  const googlePageDeduped =
    googlePage && googleReview && googlePage === googleReview ? null : googlePage;

  return {
    googleReviewUrl: googleReview,
    googlePageUrl: googlePageDeduped,
    yelpPageUrl: yelpPage,
  };
}

async function buildBodies(params: {
  customerName: string;
  projectLabel: string;
  reviewUrl: string | null;
  links: ReturnType<typeof resolveReviewEmailLinks>;
  sendAs: string;
}): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { googleReviewUrl, googlePageUrl, yelpPageUrl } = params.links;
  const customer = params.customerName.trim();
  const label = params.projectLabel.trim();
  const subject = `Thanks, ${customer} — quick favor?`;

  const primaryReview =
    params.reviewUrl?.trim() || googleReviewUrl || googlePageUrl || (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  const googleCtaUrl = safeHttpUrl(primaryReview) || 'https://getbeseen.com';
  const reviewLink = escapeHtmlAttr(googleCtaUrl);
  const yelpLink = escapeHtmlAttr(safeHttpUrl(yelpPageUrl ?? '') || safeHttpUrl(DEFAULT_YELP_REVIEW_URL));

  const companyName = (process.env.REVIEW_REQUEST_COMPANY_NAME ?? 'Be Seen').trim();
  const logoUrl =
    safeHttpUrl((process.env.REVIEW_REQUEST_EMAIL_LOGO_URL ?? '').trim()) ||
    safeHttpUrl(DEFAULT_REVIEW_LOGO_URL);
  const bgUrl =
    safeHttpUrl((process.env.REVIEW_REQUEST_EMAIL_BACKGROUND_URL ?? '').trim()) ||
    safeHttpUrl(DEFAULT_REVIEW_BG_URL);

  const unsubHref = `mailto:${params.sendAs}?subject=${encodeURIComponent('Unsubscribe from review request emails')}`;
  const unsubLink = escapeHtmlAttr(unsubHref);

  const tpl = await loadReviewRequestEmailHtmlTemplate();
  const html = applyReviewEmailTemplate(tpl, {
    customer_name: escapeHtml(customer),
    company_name: escapeHtml(companyName),
    company_logo: escapeHtmlAttr(logoUrl),
    background_image: escapeHtmlAttr(bgUrl),
    review_link: reviewLink,
    yelp_review_link: yelpLink,
    unsubscribe_link: unsubLink,
  });

  const sendAs = params.sendAs;
  const textLines: string[] = [
    `Hi ${customer},`,
    '',
    `We have wrapped up ${label}. Thank you for choosing ${companyName}.`,
    '',
    'If you have a moment, we would love a quick review:',
  ];
  const plainGoogle = params.reviewUrl?.trim() || googleReviewUrl;
  if (plainGoogle) textLines.push(`- Google review: ${plainGoogle}`);
  if (googlePageUrl && googlePageUrl !== plainGoogle) textLines.push(`- Google Business: ${googlePageUrl}`);
  if (yelpPageUrl) textLines.push(`- Yelp: ${yelpPageUrl}`);
  if (!plainGoogle && !googlePageUrl && !yelpPageUrl) {
    textLines.push('- Thank you — we appreciate your business.');
  }
  textLines.push(
    '',
    'Thank you again,',
    companyName,
    '',
    `Questions? ${sendAs}`,
    '',
    `To stop review reminder emails, reply or email: ${sendAs} with subject "Unsubscribe".`,
  );

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
 * - `REVIEW_REQUEST_REVIEW_URL` — optional direct **Google review** link (primary blue button).
 * - Same **NEXT_PUBLIC_** URLs as the app sidebar add **Google Business** + **Yelp** outline buttons (`…INSIGHTS_URL` preferred when set).
 * - `REVIEW_REQUEST_EMAIL_TEMPLATE_PATH` — optional absolute path to the HTML template (otherwise `email.html` at repo root, then `lib/email/templates/review-request.html`).
 * - `REVIEW_REQUEST_EMAIL_LOGO_URL` — optional logo image URL for `{{company_logo}}` (default: hosted Be Seen logo).
 * - `REVIEW_REQUEST_EMAIL_BACKGROUND_URL` — optional hero background image URL (default: neutral interior stock image).
 * - `REVIEW_REQUEST_COMPANY_NAME` — optional display name for `{{company_name}}` (default: `Be Seen`).
 */
type ReviewEmailSendOnceResult =
  | { kind: 'sent'; to: string }
  | { kind: 'skipped'; reason: string; logToActivity: boolean }
  | { kind: 'failed'; reason: string };

async function sendReviewRequestEmailOnce(job: Job, mode: 'auto' | 'manual'): Promise<ReviewEmailSendOnceResult> {
  if (!reviewRequestEmailFeatureEnabled()) {
    return {
      kind: 'skipped',
      reason: 'Review request emails are disabled (REVIEW_REQUEST_EMAIL_ENABLED).',
      logToActivity: false,
    };
  }
  if (mode === 'auto' && job.reviewRequestEmailSentAt != null) {
    return { kind: 'skipped', reason: 'already_sent', logToActivity: false };
  }

  const sendAs = getReviewRequestSendAsEmail();
  let oauth2;
  try {
    oauth2 = await getGmailOAuth2ClientForSendMailbox(sendAs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: 'skipped', reason: `Review email not sent: ${msg}`, logToActivity: true };
  }

  const { to, skipReason } = await resolveBillToEmail(job);
  if (!to) {
    return { kind: 'skipped', reason: skipReason ?? 'No recipient.', logToActivity: true };
  }

  const reviewUrl = (process.env.REVIEW_REQUEST_REVIEW_URL ?? '').trim() || null;
  const projectLabel = jobDisplayTitle(job);
  const links = resolveReviewEmailLinks();

  const { subject, html, text } = await buildBodies({
    customerName: job.customerName,
    projectLabel,
    reviewUrl,
    links,
    sendAs,
  });

  const fromHeader = `Be Seen <${sendAs}>`;
  const rfc822 = buildHtmlRfc822Message({
    from: fromHeader,
    to,
    subject,
    html,
    text,
  });

  try {
    await gmailSendRfc822(oauth2, rfc822);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: 'failed', reason: `Gmail API did not send: ${msg.slice(0, 2000)}` };
  }

  await prisma.job.update({
    where: { id: job.id },
    data: { reviewRequestEmailSentAt: new Date() },
  });

  const eventName = mode === 'manual' ? 'review_request_email.sent_manual' : 'review_request_email.sent';
  const message =
    mode === 'manual'
      ? `Manual review request sent from ${sendAs} to invoice Bill email: ${to}`
      : `Review request sent from ${sendAs} to invoice Bill email: ${to}`;
  await logReviewEmailActivity(job.id, eventName, message);

  return { kind: 'sent', to };
}

export async function sendReviewRequestEmailAfterJobDone(job: Job): Promise<void> {
  const r = await sendReviewRequestEmailOnce(job, 'auto');
  if (r.kind === 'sent') return;
  if (r.kind === 'failed') {
    console.error('[review-request-email] Gmail send failed:', r.reason);
    await logReviewEmailActivity(job.id, 'review_request_email.failed', r.reason);
    return;
  }
  if (r.logToActivity) {
    console.warn('[review-request-email] skipped:', r.reason, { jobId: job.id });
    await logReviewEmailActivity(job.id, 'review_request_email.skipped', r.reason);
  }
}

export type SendReviewRequestEmailManualResult =
  | { ok: true; to: string }
  | { ok: false; error: string };

/** Send the review-request email on demand (ticket detail). Ignores `reviewRequestEmailSentAt` so you can resend. */
export async function sendReviewRequestEmailManual(job: Job): Promise<SendReviewRequestEmailManualResult> {
  const r = await sendReviewRequestEmailOnce(job, 'manual');
  if (r.kind === 'sent') return { ok: true, to: r.to };
  if (r.kind === 'failed') {
    await logReviewEmailActivity(job.id, 'review_request_email.failed', r.reason);
    return { ok: false, error: r.reason };
  }
  if (r.logToActivity) {
    await logReviewEmailActivity(job.id, 'review_request_email.skipped', r.reason);
  }
  return { ok: false, error: r.reason };
}
