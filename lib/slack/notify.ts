import type { Job } from '@prisma/client';
import { jobDisplayTitle } from '@/lib/domain/job-display';
import { fmtDetailDate } from '@/lib/ticket/format';

/** Same spirit as the ticket header: customer name plus estimate/invoice label (middle dot in UI). */
export function slackTicketSummary(job: Pick<Job, 'customerName' | 'projectName'>): string {
  const dot = '\u00b7';
  return `${job.customerName.trim()} ${dot} ${jobDisplayTitle(job)}`;
}

/** Matches activity feed wording for estimate/invoice sort time from QBO. */
export function slackQuickBooksDocLine(job: Pick<Job, 'qbOrderingAt'>): string {
  if (!job.qbOrderingAt) return '';
  return `QuickBooks: ${fmtDetailDate(job.qbOrderingAt)}`;
}

type SlackNotifyOpts = {
  webhookUrl?: string;
  enabled?: boolean;
};

function slackDevLog(message: string, detail?: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (detail) console.warn(`[slack] ${message}`, detail);
  else console.warn(`[slack] ${message}`);
}

/** Strip whitespace and optional wrapping quotes from .env values. */
export function normalizeSlackWebhookUrl(raw: string | undefined | null): string {
  if (raw == null) return '';
  let u = raw.trim();
  if (
    (u.startsWith('"') && u.endsWith('"')) ||
    (u.startsWith("'") && u.endsWith("'"))
  ) {
    u = u.slice(1, -1).trim();
  }
  return u;
}

function isSlackEnabled(explicit?: boolean): boolean {
  if (explicit === false) return false;
  const flag = (process.env.SLACK_NOTIFICATIONS_ENABLED ?? '').trim().toLowerCase();
  if (flag === '') return true;
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

export async function slackNotify(text: string, opts?: SlackNotifyOpts): Promise<void> {
  const webhookUrl = normalizeSlackWebhookUrl(opts?.webhookUrl ?? process.env.SLACK_WEBHOOK_URL);
  if (!webhookUrl) {
    slackDevLog('skipped: SLACK_WEBHOOK_URL is empty or missing');
    return;
  }
  if (!isSlackEnabled(opts?.enabled)) {
    slackDevLog('skipped: SLACK_NOTIFICATIONS_ENABLED is off');
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text }),
    });
    const body = await res.text().catch(() => '');
    if (!res.ok) {
      slackDevLog(`webhook HTTP ${res.status}`, body.slice(0, 500));
      return;
    }
    if (body.trim() !== 'ok') {
      slackDevLog('unexpected response body', body.slice(0, 200));
    }
  } catch (err) {
    slackDevLog('fetch failed', err instanceof Error ? err.message : String(err));
  }
}

export function ticketUrl(jobId: string): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/dashboard/jobs/${jobId}`;
}
