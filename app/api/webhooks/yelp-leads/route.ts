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
import { yelpFetchLead, yelpFetchLeadEvents } from '@/lib/yelp/leads-api';
import { buildYelpLeadProjectDescription, extractLeadIdsFromYelpWebhook } from '@/lib/yelp/leads-webhook';

/** Shared secret: append `?token=…` to the webhook URL in Yelp, or Authorization: Bearer, or X-Dash-Yelp-Secret. */
function yelpInboundWebhookAuthorized(req: NextRequest): boolean {
  const secret = process.env.YELP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!secret) return false;
  const q =
    req.nextUrl.searchParams.get('token')?.trim() ??
    req.nextUrl.searchParams.get('verify')?.trim() ??
    '';
  if (q === secret) return true;
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (bearer === secret) return true;
  return (req.headers.get('x-dash-yelp-secret')?.trim() ?? '') === secret;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      'Dash Yelp Leads webhook. Configure Yelp Leads Webhooks to POST here. ' +
      'Set YELP_LEADS_ACCESS_TOKEN (OAuth bearer from Leads API, not Fusion) and YELP_WEBHOOK_VERIFY_TOKEN. ' +
      'Register URL with ?token=<verify> or send the same value as Authorization: Bearer. ' +
      'See https://docs.developer.yelp.com/docs/leads-webhooks',
  });
}

export async function POST(req: NextRequest) {
  if (!yelpInboundWebhookAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.YELP_LEADS_ACCESS_TOKEN?.trim()) {
    return NextResponse.json({ ok: false, error: 'yelp_token_not_configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const leadIds = extractLeadIdsFromYelpWebhook(body);
  if (leadIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'no_lead_id_in_payload' }, { status: 400 });
  }

  const jobIds: string[] = [];

  for (const leadId of leadIds) {
    try {
      const [lead, events] = await Promise.all([
        yelpFetchLead(leadId),
        yelpFetchLeadEvents(leadId, 40),
      ]);

      const built = buildYelpLeadProjectDescription(lead, events);
      const existing = await prisma.job.findUnique({
        where: { yelpLeadId: leadId },
        select: { id: true },
      });

      if (existing) {
        await prisma.job.update({
          where: { id: existing.id },
          data: {
            ...(built.projectDescription != null ? { projectDescription: built.projectDescription } : {}),
            customerName: built.customerName,
          },
        });
        await prisma.activityLog.create({
          data: {
            jobId: existing.id,
            source: EventSource.SYSTEM,
            eventName: 'yelp.lead_webhook',
            message: 'Yelp lead updated (new message or event). Details refreshed from Leads API.',
            metadata: { webhook: body as object, leadId, eventCount: events.length },
          },
        });
        jobIds.push(existing.id);
        continue;
      }

      const job = await prisma.job.create({
        data: {
          customerName: built.customerName,
          projectName: built.projectName,
          projectDescription: built.projectDescription,
          inboundLeadKind: InboundLeadKind.YELP_LEAD,
          yelpLeadId: leadId,
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
          eventName: 'inbound.yelp_lead',
          message: 'Pre-quote ticket created from Yelp Leads webhook.',
          metadata: { webhook: body as object, leadId },
        },
      });

      if (built.seedEmail) {
        await prisma.linkedEmail.create({
          data: {
            jobId: job.id,
            fromAddr: built.seedEmail,
            notes: 'Yelp lead email (proxy or consumer address from Leads API).',
          },
        });
      }

      jobIds.push(job.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { ok: false, error: 'yelp_api_error', leadId, detail: msg.slice(0, 500) },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: true, jobIds });
}
