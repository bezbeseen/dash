import { prisma } from '@/lib/db/prisma';

export type QbTicketsToolbar = {
  hasToken: boolean;
  lastTicketSyncAt: Date | null;
  lastSyncUnknown: boolean;
};

/** QB connection + last manual sync time; survives DBs missing lastTicketSyncAt column. */
export async function loadQbTicketsToolbar(): Promise<QbTicketsToolbar> {
  try {
    const row = await prisma.quickBooksToken.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { lastTicketSyncAt: true },
    });
    if (!row) return { hasToken: false, lastTicketSyncAt: null, lastSyncUnknown: false };
    return { hasToken: true, lastTicketSyncAt: row.lastTicketSyncAt, lastSyncUnknown: false };
  } catch {
    try {
      const row = await prisma.quickBooksToken.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      return {
        hasToken: row != null,
        lastTicketSyncAt: null,
        lastSyncUnknown: row != null,
      };
    } catch {
      return { hasToken: false, lastTicketSyncAt: null, lastSyncUnknown: false };
    }
  }
}
