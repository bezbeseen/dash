import { NextRequest, NextResponse } from 'next/server';
import { EventProcessStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { upsertJobFromEstimate, upsertJobFromInvoice } from '@/lib/domain/sync';
import { fetchEstimateById, fetchInvoiceById, verifyQuickBooksSignature } from '@/lib/quickbooks/client';
import { QboWebhookPayload } from '@/lib/quickbooks/types';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('intuit-signature');

  if (!verifyQuickBooksSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as QboWebhookPayload;

  for (const notification of payload.eventNotifications ?? []) {
    const realmId = notification.realmId;
    for (const entity of notification.dataChangeEvent?.entities ?? []) {
      const providerEventKey = `${realmId}:${entity.name}:${entity.id}:${entity.operation}:${entity.lastUpdated ?? ''}`;

      const existing = await prisma.quickBooksWebhookEvent.findUnique({ where: { providerEventKey } });
      if (existing) continue;

      await prisma.quickBooksWebhookEvent.create({
        data: {
          providerEventKey,
          realmId,
          entityType: entity.name,
          entityId: entity.id,
          operation: entity.operation,
          payload: payload as object,
        },
      });

      try {
        if (entity.name === 'Estimate') {
          const estimate = await fetchEstimateById(realmId, entity.id);
          await upsertJobFromEstimate(estimate, { realmId });
        }

        if (entity.name === 'Invoice') {
          const invoice = await fetchInvoiceById(realmId, entity.id);
          await upsertJobFromInvoice(invoice, { realmId });
        }

        await prisma.quickBooksWebhookEvent.update({
          where: { providerEventKey },
          data: { status: EventProcessStatus.PROCESSED, processedAt: new Date() },
        });
      } catch (error) {
        await prisma.quickBooksWebhookEvent.update({
          where: { providerEventKey },
          data: {
            status: EventProcessStatus.FAILED,
            processedAt: new Date(),
            errorText: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
