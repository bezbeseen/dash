const QBO_KEY_PREFIX = 'q-';
const NAME_KEY_PREFIX = 'n-';

export type CustomerJobRollupInput = {
  customerName: string;
  quickbooksCustomerId: string | null;
  archivedAt: Date | null;
  estimateAmountCents: number;
  invoiceAmountCents: number;
  amountPaidCents: number;
  updatedAt: Date;
};

export type CustomerListRow = {
  key: string;
  name: string;
  quickbooksCustomerId: string | null;
  openJobCount: number;
  archivedJobCount: number;
  totalJobCount: number;
  estimatedCents: number;
  outstandingCents: number;
  invoicedCents: number;
  paidCents: number;
  lastUpdatedAt: Date;
};

export type ParsedCustomerCrmKey =
  | { kind: 'qbo'; id: string }
  | { kind: 'name'; name: string };

export function jobOutstandingCents(job: {
  invoiceAmountCents: number;
  amountPaidCents: number;
}): number {
  return Math.max(0, job.invoiceAmountCents - job.amountPaidCents);
}

export function customerCrmKey(input: {
  quickbooksCustomerId?: string | null;
  customerName: string;
}): string {
  const qbo = input.quickbooksCustomerId?.trim();
  if (qbo) return `${QBO_KEY_PREFIX}${qbo}`;
  const name = input.customerName.trim() || '(no name)';
  return `${NAME_KEY_PREFIX}${Buffer.from(name, 'utf8').toString('base64url')}`;
}

export function customerCrmHref(input: {
  quickbooksCustomerId?: string | null;
  customerName: string;
}): string {
  return `/dashboard/customers/${customerCrmKey(input)}`;
}

export function parseCustomerCrmKey(raw: string): ParsedCustomerCrmKey | null {
  const key = raw.trim();
  if (key.startsWith(QBO_KEY_PREFIX) && key.length > QBO_KEY_PREFIX.length) {
    const id = key.slice(QBO_KEY_PREFIX.length).trim();
    return id ? { kind: 'qbo', id } : null;
  }
  if (key.startsWith(NAME_KEY_PREFIX) && key.length > NAME_KEY_PREFIX.length) {
    try {
      const name = Buffer.from(key.slice(NAME_KEY_PREFIX.length), 'base64url').toString('utf8').trim();
      return name ? { kind: 'name', name } : null;
    } catch {
      return null;
    }
  }
  return null;
}

function groupBucketId(job: CustomerJobRollupInput): string {
  const qbo = job.quickbooksCustomerId?.trim();
  if (qbo) return `qbo:${qbo}`;
  const name = job.customerName.trim().toLowerCase() || '(no name)';
  return `name:${name}`;
}

export function rollupCustomersFromJobs(jobs: CustomerJobRollupInput[]): CustomerListRow[] {
  type Acc = {
    name: string;
    nameUpdatedAt: number;
    quickbooksCustomerId: string | null;
    openJobCount: number;
    archivedJobCount: number;
    estimatedCents: number;
    outstandingCents: number;
    invoicedCents: number;
    paidCents: number;
    lastUpdatedAt: Date;
  };
  const map = new Map<string, Acc>();

  for (const job of jobs) {
    const bucket = groupBucketId(job);
    const qbo = job.quickbooksCustomerId?.trim() || null;
    const name = job.customerName.trim() || '(no name)';
    const updatedMs = job.updatedAt.getTime();
    const existing = map.get(bucket);
    if (!existing) {
      map.set(bucket, {
        name,
        nameUpdatedAt: updatedMs,
        quickbooksCustomerId: qbo,
        openJobCount: job.archivedAt ? 0 : 1,
        archivedJobCount: job.archivedAt ? 1 : 0,
        estimatedCents: job.estimateAmountCents,
        outstandingCents: jobOutstandingCents(job),
        invoicedCents: job.invoiceAmountCents,
        paidCents: job.amountPaidCents,
        lastUpdatedAt: job.updatedAt,
      });
      continue;
    }
    existing.openJobCount += job.archivedAt ? 0 : 1;
    existing.archivedJobCount += job.archivedAt ? 1 : 0;
    existing.estimatedCents += job.estimateAmountCents;
    existing.outstandingCents += jobOutstandingCents(job);
    existing.invoicedCents += job.invoiceAmountCents;
    existing.paidCents += job.amountPaidCents;
    if (updatedMs >= existing.lastUpdatedAt.getTime()) {
      existing.lastUpdatedAt = job.updatedAt;
    }
    if (updatedMs >= existing.nameUpdatedAt && name !== '(no name)') {
      existing.name = name;
      existing.nameUpdatedAt = updatedMs;
    }
    if (!existing.quickbooksCustomerId && qbo) existing.quickbooksCustomerId = qbo;
  }

  return [...map.values()]
    .map((row) => ({
      key: customerCrmKey({
        quickbooksCustomerId: row.quickbooksCustomerId,
        customerName: row.name,
      }),
      name: row.name,
      quickbooksCustomerId: row.quickbooksCustomerId,
      openJobCount: row.openJobCount,
      archivedJobCount: row.archivedJobCount,
      totalJobCount: row.openJobCount + row.archivedJobCount,
      estimatedCents: row.estimatedCents,
      outstandingCents: row.outstandingCents,
      invoicedCents: row.invoicedCents,
      paidCents: row.paidCents,
      lastUpdatedAt: row.lastUpdatedAt,
    }))
    .sort((a, b) => {
      if (b.outstandingCents !== a.outstandingCents) return b.outstandingCents - a.outstandingCents;
      if (b.openJobCount !== a.openJobCount) return b.openJobCount - a.openJobCount;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

export function customerRowMatchesQuery(
  row: Pick<CustomerListRow, 'name' | 'quickbooksCustomerId'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (row.name.toLowerCase().includes(q)) return true;
  return Boolean(row.quickbooksCustomerId?.toLowerCase().includes(q));
}
