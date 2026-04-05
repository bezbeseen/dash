import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { listBankAccountsDetailed } from '@/lib/quickbooks/client';
import type { BankAccountBalance } from '@/lib/quickbooks/types';

/** Cash page: hide these institutions from totals and lists (name match, case-insensitive). */
function isCashAccountHiddenByName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('chase') || n.includes('bank of america') || n.includes('bofa');
}

export function filterCashPageAccounts(accounts: BankAccountBalance[]): BankAccountBalance[] {
  return accounts.filter((a) => !isCashAccountHiddenByName(a.name));
}

export type QbCashPageData =
  | { kind: 'disconnected' }
  | { kind: 'error' }
  | { kind: 'ok'; realmId: string; accounts: BankAccountBalance[] };

export const loadQbCashPageData = cache(async (): Promise<QbCashPageData> => {
  const token = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { realmId: true },
  });
  if (!token) return { kind: 'disconnected' };
  try {
    const raw = await listBankAccountsDetailed(token.realmId);
    const accounts = filterCashPageAccounts(raw);
    return { kind: 'ok', realmId: token.realmId, accounts };
  } catch {
    return { kind: 'error' };
  }
});

export type BankAccountGroup = {
  subtypeLabel: string;
  accounts: BankAccountBalance[];
  subtotalCents: number;
};

/** Group by QBO AccountSubType for section headings; sort groups by subtotal descending. */
export function groupBankAccountsBySubtype(accounts: BankAccountBalance[]): BankAccountGroup[] {
  const by = new Map<string, BankAccountBalance[]>();
  for (const a of accounts) {
    const k = a.accountSubType?.trim() || 'Other / unspecified';
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(a);
  }
  const groups: BankAccountGroup[] = [...by.entries()].map(([subtypeLabel, rows]) => ({
    subtypeLabel,
    accounts: rows.sort((x, y) => y.balanceCents - x.balanceCents),
    subtotalCents: rows.reduce((s, r) => s + r.balanceCents, 0),
  }));
  groups.sort((a, b) => b.subtotalCents - a.subtotalCents);
  return groups;
}
