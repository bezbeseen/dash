import { BoardStatus, EstimateStatus, EventSource, InvoiceStatus, ProductionStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sanitizeJobProjectDescription } from '@/lib/domain/job-display';

function webhookAuthorized(req: NextRequest, secret: string): boolean {
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = req.headers.get('x-dash-webhook-secret')?.trim() ?? '';
  return bearer === secret || header === secret;
}

function pickStr(root: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = root[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function buildDescription(fields: Record<string, unknown>): string | null {
  const lines: string[] = [];
  const email = pickStr(fields, 'email');
  const phone = pickStr(fields, 'phone');
  const org = pickStr(fields, 'organization');
  const a1 = pickStr(fields, 'address_1');
  const city = pickStr(fields, 'city');
  const state = pickStr(fields, 'state');
  const zip = pickStr(fields, 'postal_code', 'zip');
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (org) lines.push(`Org: ${org}`);
  const addr = [a1, city, state, zip].filter(Boolean).join(', ');
  if (addr) lines.push(`Address: ${addr}`);
  const text = lines.join('\n').trim();
  return text.length > 0 ? text.slice(0, 8000) : null;
}

/**
 * POST from marketing automation (e.g. GoHighLevel "Send Form Data via Webhook").
 * Creates a pre-quote ticket (boardStatus REQUESTED). Secured with INBOUND_FORM_WEBHOOK_SECRET.
 *
 * Headers: Authorization: Bearer <secret> OR X-Dash-Webhook-Secret: <secret>
 * Body: JSON with keys like full_name, email, phone, organization, address fields (any subset).
 */
export async function POST(req: NextRequest) {
  const expected = process.env.INBOUND_FORM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 503 });
  }
  if (!webhookAuthorized(req, expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const fullName = pickStr(body, 'full_name');
  const first = pickStr(body, 'first_name');
  const last = pickStr(body, 'last_name');
  const composed =
    fullName ||
    [first, last].filter(Boolean).join(' ').trim() ||
    pickStr(body, 'email') ||
    'Form lead';

  const projectName = pickStr(body, 'organization') || 'Website / form lead';
  const projectDescription = sanitizeJobProjectDescription(
    projectName,
    buildDescription(body),
  );

  const job = await prisma.job.create({
    data: {
      customerName: composed.slice(0, 512),
      projectName: projectName.slice(0, 512),
      projectDescription,
      boardStatus: BoardStatus.REQUESTED,
      productionStatus: ProductionStatus.NOT_STARTED,
      estimateStatus: EstimateStatus.UNKNOWN,
      invoiceStatus: InvoiceStatus.NONE,
    },
  });

  await prisma.activityLog.create({
    data: {
      jobId: job.id,
      source: EventSource.SYSTEM,
      eventName: 'inbound.form_lead',
      message: 'Lead created from inbound form webhook.',
      metadata: body as object,
    },
  });

  return NextResponse.json({ ok: true, jobId: job.id });
}
