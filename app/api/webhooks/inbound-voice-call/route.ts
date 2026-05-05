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
import {
  inboundVoiceCallWebhookSecret,
  readInboundBody,
  webhookAuthorized,
} from '@/lib/webhooks/marketing-inbound';
import { buildVoiceCallLeadFromPayload } from '@/lib/webhooks/voice-call-inbound';

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      'Dash inbound voice / AI call webhook. POST with Authorization: Bearer <INBOUND_VOICE_CALL_WEBHOOK_SECRET or INBOUND_FORM_WEBHOOK_SECRET>. Send JSON with a full notification in `body`, `text`, or `raw`; or structured caller fields.',
  });
}

/**
 * POST when a voice AI / call platform sends a summary (e.g. Zapier: forwarded email body in `body`).
 * Creates REQUESTED lead with full text in projectDescription and Seed email when an address is found.
 */
export async function POST(req: NextRequest) {
  const expected = inboundVoiceCallWebhookSecret();
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 503 });
  }
  if (!webhookAuthorized(req, expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let data: Record<string, unknown>;
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (ct.includes('text/plain')) {
    const text = (await req.text()).trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: 'empty_body' }, { status: 400 });
    }
    data = { body: text };
  } else {
    const parsed = await readInboundBody(req);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    data = parsed.data;
  }

  const { projectDescription, customerName, projectName, email } = buildVoiceCallLeadFromPayload(data);

  const job = await prisma.job.create({
    data: {
      customerName,
      projectName,
      projectDescription,
      inboundLeadKind: InboundLeadKind.VOICE_CALL,
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
      eventName: 'inbound.voice_call',
      message: 'Lead created from inbound voice / AI call webhook.',
      metadata: data as object,
    },
  });

  if (email) {
    await prisma.linkedEmail.create({
      data: {
        jobId: job.id,
        fromAddr: email.slice(0, 512),
        notes: 'Lead email (voice / AI call webhook).',
      },
    });
  }

  return NextResponse.json({ ok: true, jobId: job.id });
}
