import type { Job } from '@prisma/client';
import { EventSource } from '@prisma/client';
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

function buildBodies(params: {
  customerName: string;
  projectLabel: string;
  reviewUrl: string | null;
  links: ReturnType<typeof resolveReviewEmailLinks>;
}): {
  subject: string;
  html: string;
  text: string;
} {
  const { googleReviewUrl, googlePageUrl, yelpPageUrl } = params.links;
  const who = escapeHtml(params.customerName.trim());
  const label = escapeHtml(params.projectLabel.trim());
  const subject = `Thanks, ${params.customerName.trim()} — quick favor?`;

  const primaryReview = params.reviewUrl?.trim() || googleReviewUrl;
  const primaryBlock = primaryReview
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 8px 0;">
  <tr><td align="center">
    <a href="${primaryReview}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Leave a Google review</a>
  </td></tr>
  <tr><td align="center" style="padding-top:10px;font-size:12px;color:#64748b;font-family:system-ui,sans-serif;">Opens in your browser — thank you for taking a moment.</td></tr>
</table>`
    : `<p style="margin:18px 0 8px 0;font-size:15px;color:#334155;font-family:system-ui,sans-serif;line-height:1.55;">If you are happy with our work, we would love a quick review on <strong>Google</strong> or <strong>Yelp</strong> — it helps other businesses find us.</p>`;

  const secondaryRow =
    googlePageUrl || yelpPageUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0 4px 0;">
  <tr>
    <td style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;padding-bottom:12px;">Find us online</td>
  </tr>
  <tr>
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          ${
            googlePageUrl
              ? `<td style="padding:6px 8px 6px 0;vertical-align:top;" width="50%">
            <a href="${googlePageUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;padding:12px 14px;border:2px solid #e2e8f0;border-radius:10px;color:#0f172a;text-decoration:none;font-weight:600;font-size:14px;font-family:system-ui,sans-serif;background:#f8fafc;">Google Business</a>
          </td>`
              : '<td width="50%"></td>'
          }
          ${
            yelpPageUrl
              ? `<td style="padding:6px 0 6px 8px;vertical-align:top;" width="50%">
            <a href="${yelpPageUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;padding:12px 14px;border:2px solid #ffcca8;border-radius:10px;color:#7c2d12;text-decoration:none;font-weight:600;font-size:14px;font-family:system-ui,sans-serif;background:#fff7ed;">Yelp</a>
          </td>`
              : '<td width="50%"></td>'
          }
        </tr>
      </table>
    </td>
  </tr>
</table>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#e8edf3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf3;padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.1);">
      <tr>
        <td style="padding:26px 28px;background:linear-gradient(125deg,#0f172a 0%,#1e3a5f 55%,#1e40af 100%);">
          <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Be Seen</div>
          <div style="font-size:13px;color:#93c5fd;margin-top:6px;font-family:system-ui,sans-serif;">Signs &amp; visual branding</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 28px 28px 28px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;line-height:1.6;">
          <p style="margin:0 0 14px 0;font-size:17px;">Hi ${who},</p>
          <p style="margin:0 0 18px 0;font-size:15px;color:#334155;">We have wrapped up <strong style="color:#0f172a;">${label}</strong>. Thank you for choosing us — we hope everything exceeded expectations.</p>
          <p style="margin:0 0 6px 0;font-size:15px;color:#334155;">If you have a moment, would you share a quick review? It makes a real difference for a small shop like ours.</p>
          ${primaryBlock}
          ${secondaryRow}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;padding-top:22px;border-top:1px solid #e2e8f0;">
            <tr>
              <td style="font-size:14px;color:#475569;">With gratitude,<br/><strong style="color:#0f172a;">The Be Seen team</strong></td>
            </tr>
          </table>
          <p style="margin:20px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">Questions? Reply to this email or write to <a href="mailto:${escapeHtml(getReviewRequestSendAsEmail())}" style="color:#2563eb;text-decoration:none;">${escapeHtml(getReviewRequestSendAsEmail())}</a>.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const sendAs = getReviewRequestSendAsEmail();
  const textLines: string[] = [
    `Hi ${params.customerName.trim()},`,
    '',
    `We have wrapped up ${params.projectLabel.trim()}. Thank you for choosing Be Seen.`,
    '',
    'If you have a moment, we would love a quick review:',
  ];
  if (primaryReview) textLines.push(`- Google review: ${primaryReview}`);
  if (googlePageUrl) textLines.push(`- Google Business: ${googlePageUrl}`);
  if (yelpPageUrl) textLines.push(`- Yelp: ${yelpPageUrl}`);
  if (!primaryReview && !googlePageUrl && !yelpPageUrl) {
    textLines.push('- Thank you — we appreciate your business.');
  }
  textLines.push(
    '',
    'Thank you again,',
    'Be Seen',
    '',
    `Questions? ${sendAs}`,
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
 */
export async function sendReviewRequestEmailAfterJobDone(job: Job): Promise<void> {
  if (!reviewRequestEmailFeatureEnabled()) return;
  if (job.reviewRequestEmailSentAt != null) return;

  const sendAs = getReviewRequestSendAsEmail();
  let oauth2;
  try {
    oauth2 = await getGmailOAuth2ClientForSendMailbox(sendAs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[review-request-email] skipped (mailbox):', msg);
    await logReviewEmailActivity(
      job.id,
      'review_request_email.skipped',
      `Review email not sent: ${msg}`,
    );
    return;
  }

  const { to, skipReason } = await resolveBillToEmail(job);
  if (!to) {
    const line = skipReason ?? 'No recipient.';
    console.warn('[review-request-email] skipped (recipient):', line, { jobId: job.id });
    await logReviewEmailActivity(job.id, 'review_request_email.skipped', line);
    return;
  }

  const reviewUrl = (process.env.REVIEW_REQUEST_REVIEW_URL ?? '').trim() || null;
  const projectLabel = jobDisplayTitle(job);
  const links = resolveReviewEmailLinks();

  const { subject, html, text } = buildBodies({
    customerName: job.customerName,
    projectLabel,
    reviewUrl,
    links,
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
    console.error('[review-request-email] Gmail send failed:', msg);
    await logReviewEmailActivity(
      job.id,
      'review_request_email.failed',
      `Gmail API did not send: ${msg.slice(0, 2000)}`,
    );
    return;
  }

  await prisma.job.update({
    where: { id: job.id },
    data: { reviewRequestEmailSentAt: new Date() },
  });

  await logReviewEmailActivity(
    job.id,
    'review_request_email.sent',
    `Review request sent from ${sendAs} to invoice Bill email: ${to}`,
  );
}
