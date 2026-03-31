import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { listCheckingAccountBalances } from '@/lib/quickbooks/client';

function fmtUsd(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export const getCheckingWidgetData = cache(async () => {
  const token = await prisma.quickBooksToken.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!token) return { kind: 'disconnected' as const };

  try {
    const accounts = await listCheckingAccountBalances(token.realmId);
    return { kind: 'ok' as const, accounts };
  } catch {
    return { kind: 'error' as const };
  }
});

/** Sidebar cash snapshot from QuickBooks (checking / bank accounts). */
export async function CheckingBalanceWidget() {
  const data = await getCheckingWidgetData();

  if (data.kind === 'disconnected') {
    return (
      <div className="qb-balance-widget qb-balance-widget-muted">
        <div className="qb-balance-widget-title">Cash in QuickBooks</div>
        <p className="qb-balance-widget-body">Connect QuickBooks to see checking balances here.</p>
      </div>
    );
  }

  if (data.kind === 'error') {
    return (
      <div className="qb-balance-widget qb-balance-widget-muted">
        <div className="qb-balance-widget-title">Cash in QuickBooks</div>
        <p className="qb-balance-widget-body">Couldn&apos;t load accounts. Try syncing or reconnecting.</p>
      </div>
    );
  }

  if (data.accounts.length === 0) {
    return (
      <div className="qb-balance-widget qb-balance-widget-muted">
        <div className="qb-balance-widget-title">Cash in QuickBooks</div>
        <p className="qb-balance-widget-body">No checking/bank accounts found in this company.</p>
      </div>
    );
  }

  const totalCents = data.accounts.reduce((s, a) => s + a.balanceCents, 0);

  return (
    <div className="qb-balance-widget">
      <div className="qb-balance-widget-title">Cash in QuickBooks</div>
      {data.accounts.length === 1 ? (
        <div className="qb-balance-hero">{fmtUsd(data.accounts[0].balanceCents)}</div>
      ) : (
        <div className="qb-balance-hero">{fmtUsd(totalCents)}</div>
      )}
      <p className="qb-balance-widget-sub">
        {data.accounts.length === 1
          ? data.accounts[0].name
          : `${data.accounts.length} bank accounts · shown as total`}
      </p>
      {data.accounts.length > 1 ? (
        <ul className="qb-balance-list">
          {data.accounts.map((a) => (
            <li key={a.id}>
              <span className="qb-balance-list-name">{a.name}</span>
              <span className="qb-balance-list-amt">{fmtUsd(a.balanceCents)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="qb-balance-widget-foot">
        Balances from QuickBooks Chart of Accounts · not real-time bank feeds unless QBO is synced
      </p>
    </div>
  );
}
