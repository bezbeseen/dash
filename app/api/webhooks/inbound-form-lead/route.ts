import {
  BoardStatus,
  EstimateStatus,
  EventSource,
  InboundLeadKind,
  InvoiceStatus,
  ProductionStatus,
} from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveInboundCustomerName } from '@/lib/domain/inbound-lead-display';
import {
  buildInboundTicketDescription,
  inboundMarketingWebhookSecret,
  normalizeInboundPayload,
  pickStr,
  readInboundBody,
  resolveInboundLeadEmail,
  webhookAuthorized,
} from '@/lib/webhooks/marketing-inbound';

/**
 * Quick check that the URL is correct and this deployment includes the route.
 * GoHighLevel must still use POST with the shared secret for real submissions.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      'Dash inbound form lead webhook. Use POST with Authorization: Bearer <INBOUND_FORM_WEBHOOK_SECRET> (or X-Dash-Webhook-Secret).',
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
  const expected = inboundMarketingWebhookSecret('form');
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 503 });
  }
  if (!webhookAuthorized(req, expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const parsed = await readInboundBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const body = normalizeInboundPayload(parsed.data);

  const fullName = pickStr(body, 'full_name', 'fullName', 'name');
  const first = pickStr(body, 'first_name', 'firstName');
  const last = pickStr(body, 'last_name', 'lastName');
  const composed =
    fullName ||
    [first, last].filter(Boolean).join(' ').trim() ||
    resolveInboundLeadEmail(body) ||
    'Form lead';

  const projectName =
    pickStr(body, 'organization', 'company', 'company_name') || 'Website / form lead';
  const projectDescription = buildInboundTicketDescription(projectName, body, {
    includeConversation: false,
  });

  const job = await prisma.job.create({
    data: {
      customerName: resolveInboundCustomerName(body, composed, projectDescription),
      projectName: projectName.slice(0, 512),
      projectDescription,
      inboundLeadKind: InboundLeadKind.FORM,
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

  const leadEmail = resolveInboundLeadEmail(body);
  if (leadEmail) {
    await prisma.linkedEmail.create({
      data: {
        jobId: job.id,
        fromAddr: leadEmail.slice(0, 512),
        notes: 'Lead email (inbound form webhook).',
      },
    });
  }

  return NextResponse.json({ ok: true, jobId: job.id });
}
