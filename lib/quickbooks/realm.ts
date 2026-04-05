import { prisma } from '@/lib/db/prisma';

/** Prefer job-stored realm (company) id; fall back to the connected QBO company. */
export async function resolveRealmIdForJob(quickbooksCompanyId: string | null | undefined): Promise<string | null> {
  if (quickbooksCompanyId) return quickbooksCompanyId;
  const token = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { realmId: true },
  });
  return token?.realmId ?? null;
}
