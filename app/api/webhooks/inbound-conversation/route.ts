import { BoardStatus, EstimateStatus, EventSource, InvoiceStatus, ProductionStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  buildInboundTicketDescription,
  inboundMarketingWebhookSecret,
  normalizeInboundPayload,
  pickStr,
  readInboundBody,
  webhookAuthorized,
} from '@/lib/webhooks/marketing-inbound';

/**
 * Confirms this URL is deployed. Real traffic must be POST + secret.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      'Dash inbound conversation webhook. Use POST with Authorization: Bearer <INBOUND_CONVERSATION_WEBHOOK_SECRET or INBOUND_FORM_WEBHOOK_SECRET>.',
  });
}

/**
 * POST from marketing automation (e.g. GoHighLevel workflow when a conversation fires).
 * Creates a pre-quote ticket (REQUESTED). Uses INBOUND_CONVERSATION_WEBHOOK_SECRET if set, else INBOUND_FORM_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const expected = inboundMarketingWebhookSecret('conversation');
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

  const fullName = pickStr(body, 'full_name', 'fullName', 'name', 'contact_name');
  const first = pickStr(body, 'first_name', 'firstName');
  const last = pickStr(body, 'last_name', 'lastName');
  const composed =
    fullName ||
    [first, last].filter(Boolean).join(' ').trim() ||
    pickStr(body, 'email') ||
    'Conversation lead';

  const projectName =
    pickStr(body, 'subject', 'title', 'organization', 'company', 'company_name') || 'Conversation / SMS lead';

  const projectDescription = buildInboundTicketDescription(projectName, body, {
    includeConversation: true,
  });

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
      eventName: 'inbound.conversation',
      message: 'Lead created from inbound conversation webhook.',
      metadata: parsed.data as object,
    },
  });

  return NextResponse.json({ ok: true, jobId: job.id });
}
