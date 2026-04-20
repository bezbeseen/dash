import { type Job, ProductionStatus } from '@prisma/client';
import { jobDisplayTitle, sanitizeJobProjectDescription } from '@/lib/domain/job-display';
import { fmtDetailDate } from '@/lib/ticket/format';

/** Block Kit section block (Incoming Webhooks). */
type SlackSectionBlock = {
  type: 'section';
  text: { type: 'mrkdwn'; text: string };
};

/** Same spirit as the ticket header; includes project subtitle when synced from QBO. */
export function slackTicketSummary(
  job: Pick<Job, 'customerName' | 'projectName' | 'projectDescription'>,
): string {
  const dot = '\u00b7';
  const title = jobDisplayTitle(job);
  const line1 = `${job.customerName.trim()} ${dot} ${title}`;
  const sub = sanitizeJobProjectDescription(job.projectName, job.projectDescription);
  return sub ? `${line1}\n${sub}` : line1;
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

/** Done/Lost archive pings (separate from production workflow). Default on. */
export function slackArchiveNotificationsEnabled(): boolean {
  const v = (process.env.SLACK_NOTIFY_ARCHIVE ?? '').trim().toLowerCase();
  if (v === '') return true;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * When `SLACK_PRODUCTION_STATUSES` is set, only those `ProductionStatus` values trigger a webhook.
 * Comma- or space-separated (case-insensitive), e.g. `IN_PROGRESS` or `IN_PROGRESS,READY,DELIVERED`.
 * Use `IN_PROGRESS` alone to notify only when work enters production (Start).
 */
export function slackShouldNotifyProductionStatus(to: ProductionStatus): boolean {
  const raw = (process.env.SLACK_PRODUCTION_STATUSES ?? '').trim();
  if (!raw) return true;
  const allowed = new Set<ProductionStatus>();
  for (const token of raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)) {
    const key = token.toUpperCase().replace(/-/g, '_');
    if (key === 'ALL') return true;
    if ((Object.values(ProductionStatus) as string[]).includes(key)) {
      allowed.add(key as ProductionStatus);
    }
  }
  if (allowed.size === 0) return true;
  return allowed.has(to);
}

/**
 * When set to `production`, webhooks only send on Vercel Production (or a non-Vercel host with NODE_ENV=production).
 * Stops local/preview spam to the live channel.
 */
function slackWebhookDeploymentAllowed(): boolean {
  const v = (process.env.SLACK_WEBHOOK_ENV ?? '').trim().toLowerCase();
  if (!v || v === 'all' || v === 'any') return true;
  if (v !== 'production') return true;
  if (process.env.VERCEL_ENV === 'production') return true;
  if (process.env.VERCEL === '1') return false;
  return process.env.NODE_ENV === 'production';
}

/** Escape &, < for Slack mrkdwn (avoid breaking links / entities). */
export function escapeSlackMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/** Rough plain-text fallback for mobile / accessibility (Slack requires `text` with blocks). */
export function slackPlainFallbackFromMrkdwn(mrkdwn: string): string {
  return mrkdwn
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2 ($1)');
}

function buildTicketLinkLine(url: string | null, jobId: string): { mrkdwn: string; plain: string } {
  if (url) {
    return {
      mrkdwn: `<${url}|Open ticket in Dash>`,
      plain: `Ticket: ${url}`,
    };
  }
  return { mrkdwn: `Ticket id: \`${escapeSlackMrkdwn(jobId)}\``, plain: `Ticket id: ${jobId}` };
}

/**
 * Incoming Webhooks: Slack recommends a `text` fallback plus Block Kit for clients that support it.
 * @see https://api.slack.com/messaging/webhooks
 */
export async function slackNotify(
  mrkdwnBody: string,
  opts?: SlackNotifyOpts & { plainFallback?: string },
): Promise<void> {
  const webhookUrl = normalizeSlackWebhookUrl(opts?.webhookUrl ?? process.env.SLACK_WEBHOOK_URL);
  if (!webhookUrl) {
    slackDevLog('skipped: SLACK_WEBHOOK_URL is empty or missing');
    return;
  }
  if (!isSlackEnabled(opts?.enabled)) {
    slackDevLog('skipped: SLACK_NOTIFICATIONS_ENABLED is off');
    return;
  }
  if (!slackWebhookDeploymentAllowed()) {
    slackDevLog('skipped: SLACK_WEBHOOK_ENV=production but this deploy is not production');
    return;
  }

  const plainText = (opts?.plainFallback ?? slackPlainFallbackFromMrkdwn(mrkdwnBody)).slice(0, 15000);
  const blocks: SlackSectionBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: mrkdwnBody.slice(0, 12000) } },
  ];

  const payload: Record<string, unknown> = {
    text: plainText,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };

  const username = process.env.SLACK_WEBHOOK_USERNAME?.trim();
  const iconEmoji = process.env.SLACK_WEBHOOK_ICON_EMOJI?.trim();
  if (username) payload.username = username;
  if (iconEmoji) payload.icon_emoji = iconEmoji;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
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

export async function slackNotifyArchived(params: {
  label: 'Done' | 'Lost';
  job: Pick<Job, 'customerName' | 'projectName' | 'projectDescription' | 'qbOrderingAt' | 'boardStatus'>;
  jobId: string;
}): Promise<void> {
  const who = escapeSlackMrkdwn(slackTicketSummary(params.job));
  const qb = slackQuickBooksDocLine(params.job);
  const qbLine = qb ? escapeSlackMrkdwn(qb) : '';
  const link = buildTicketLinkLine(ticketUrl(params.jobId), params.jobId);
  const from = escapeSlackMrkdwn(String(params.job.boardStatus));

  const mrkdwn = [
    `*Ticket moved off board (${params.label}).*`,
    who,
    qbLine || undefined,
    `From: \`${from}\``,
    link.mrkdwn,
  ]
    .filter(Boolean)
    .join('\n');

  const plain = [
    `Ticket moved off board (${params.label}).`,
    slackPlainFallbackFromMrkdwn(who),
    qbLine ? slackPlainFallbackFromMrkdwn(qbLine) : '',
    `From: ${params.job.boardStatus}`,
    link.plain,
  ]
    .filter(Boolean)
    .join('\n');

  await slackNotify(mrkdwn, { plainFallback: plain });
}

export async function slackNotifyProductionChange(params: {
  message: string;
  job: Pick<
    Job,
    | 'customerName'
    | 'projectName'
    | 'projectDescription'
    | 'qbOrderingAt'
    | 'productionStatus'
    | 'boardStatus'
  >;
  toProduction: ProductionStatus;
  finalBoardStatus: string;
  jobId: string;
}): Promise<void> {
  if (!slackShouldNotifyProductionStatus(params.toProduction)) {
    slackDevLog(`skipped: production status ${params.toProduction} not in SLACK_PRODUCTION_STATUSES allowlist`);
    return;
  }

  const mention = (process.env.SLACK_PRODUCTION_MENTION ?? '').trim();
  const headline = escapeSlackMrkdwn(params.message);
  const who = escapeSlackMrkdwn(slackTicketSummary(params.job));
  const qb = slackQuickBooksDocLine(params.job);
  const qbLine = qb ? escapeSlackMrkdwn(qb) : '';
  const prodFrom = escapeSlackMrkdwn(String(params.job.productionStatus));
  const prodTo = escapeSlackMrkdwn(String(params.toProduction));
  const boardFrom = escapeSlackMrkdwn(String(params.job.boardStatus));
  const boardTo = escapeSlackMrkdwn(params.finalBoardStatus);
  const link = buildTicketLinkLine(ticketUrl(params.jobId), params.jobId);

  const mrkdwn = [
    ...(mention ? [mention] : []),
    `*${headline}*`,
    who,
    qbLine || undefined,
    `Production: \`${prodFrom}\` → \`${prodTo}\``,
    `Board: \`${boardFrom}\` → \`${boardTo}\``,
    link.mrkdwn,
  ]
    .filter(Boolean)
    .join('\n');

  const plain = [
    ...(mention ? [slackPlainFallbackFromMrkdwn(mention)] : []),
    params.message,
    slackPlainFallbackFromMrkdwn(who),
    qbLine ? slackPlainFallbackFromMrkdwn(qbLine) : '',
    `Production: ${params.job.productionStatus} → ${params.toProduction}`,
    `Board: ${params.job.boardStatus} → ${params.finalBoardStatus}`,
    link.plain,
  ]
    .filter(Boolean)
    .join('\n');

  await slackNotify(mrkdwn, { plainFallback: plain });
}
