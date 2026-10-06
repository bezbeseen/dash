import { NextRequest, NextResponse } from 'next/server';
import { runAutoSync } from '@/lib/domain/auto-sync';
import { webhookAuthorized } from '@/lib/webhooks/marketing-inbound';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Same sync the open dashboard runs, for when nobody has Dash open. Point Vercel Cron or any
 * scheduler here with `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it automatically)
 * or `X-Dash-Webhook-Secret: <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'cron_not_configured' }, { status: 503 });
  }
  if (!webhookAuthorized(req, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runAutoSync({ force: true })) });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'auto_sync_failed';
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
