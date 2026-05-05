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

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/** GHL and others often nest under contact / formData / data; merge into one flat lookup. */
function normalizeLeadFields(raw: Record<string, unknown>): Record<string, unknown> {
  const nestedKeys = ['contact', 'formData', 'form', 'data', 'payload', 'customData', 'body'] as const;
  const merged: Record<string, unknown> = {};
  for (const key of nestedKeys) {
    const r = asRecord(raw[key]);
    if (r) Object.assign(merged, r);
  }
  Object.assign(merged, raw);
  return merged;
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
  const phone = pickStr(fields, 'phone', 'phone_number');
  const org = pickStr(fields, 'organization', 'company', 'company_name');
  const a1 = pickStr(fields, 'address_1', 'address1', 'street', 'address');
  const city = pickStr(fields, 'city');
  const state = pickStr(fields, 'state');
  const zip = pickStr(fields, 'postal_code', 'zip', 'zip_code');
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (org) lines.push(`Org: ${org}`);
  const addr = [a1, city, state, zip].filter(Boolean).join(', ');
  if (addr) lines.push(`Address: ${addr}`);
  const text = lines.join('\n').trim();
  return text.length > 0 ? text.slice(0, 8000) : null;
}

async function readLeadBody(req: NextRequest): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  try {
    if (ct.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const o: Record<string, unknown> = {};
      params.forEach((v, k) => {
        o[k] = v;
      });
      return { ok: true, data: o };
    }
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const o: Record<string, unknown> = {};
      for (const [k, v] of form.entries()) {
        o[k] = typeof v === 'string' ? v : v instanceof File ? v.name : String(v);
      }
      return { ok: true, data: o };
    }
    const text = await req.text();
    if (!text.trim()) return { ok: true, data: {} };
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'json_not_object' };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'parse_failed' };
  }
}

/**
 * Quick check that the URL is correct and this deployment includes the route.
 * GoHighLevel must still use POST with the shared secret for real submissions.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      'Dash inbound lead webhook. Use POST with Authorization: Bearer <INBOUND_FORM_WEBHOOK_SECRET> (or X-Dash-Webhook-Secret).',
  });
}

/**
 * POST from marketing automation (e.g. GoHighLevel "Send Form Data via Webhook").
 * Creates a pre-quote ticket (boardStatus REQUESTED). Secured with INBOUND_FORM_WEBHOOK_SECRET.
 *
 * Headers: Authorization: Bearer <secret> OR X-Dash-Webhook-Secret: <secret>
 * Body: JSON or form fields with keys like full_name / fullName, email, phone, organization (any subset).
 */
export async function POST(req: NextRequest) {
  const expected = process.env.INBOUND_FORM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 503 });
  }
  if (!webhookAuthorized(req, expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const parsed = await readLeadBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const body = normalizeLeadFields(parsed.data);

  const fullName = pickStr(body, 'full_name', 'fullName', 'name');
  const first = pickStr(body, 'first_name', 'firstName');
  const last = pickStr(body, 'last_name', 'lastName');
  const composed =
    fullName ||
    [first, last].filter(Boolean).join(' ').trim() ||
    pickStr(body, 'email') ||
    'Form lead';

  const projectName =
    pickStr(body, 'organization', 'company', 'company_name') || 'Website / form lead';
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
      metadata: parsed.data as object,
    },
  });

  return NextResponse.json({ ok: true, jobId: job.id });
}
