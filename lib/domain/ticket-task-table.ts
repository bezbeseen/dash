/** Work tab ticket task table: row shape plus the client-side assignee filter and column sort. */

export type TicketTaskTableRow = {
  id: string;
  title: string;
  notes: string | null;
  jobId: string;
  ticketTitle: string;
  /** Customer line under the ticket title; null when the title already starts with it. */
  ticketCustomer: string | null;
  assigneeEmail: string | null;
  dueAt: string | null;
  dueLabel: string | null;
  overdue: boolean;
  createdAt: string;
  createdLabel: string;
  createdByEmail: string;
};

export type TicketTaskSortKey = 'title' | 'ticket' | 'assignee' | 'due' | 'status' | 'created';
type SortDir = 'asc' | 'desc';

/** Filter values besides a lowercased assignee email. */
export const TASK_FILTER_ALL = 'all';
export const TASK_FILTER_UNASSIGNED = 'unassigned';

export function ticketCustomerLine(ticketTitle: string, customerName: string): string | null {
  const customer = customerName.trim();
  if (!customer) return null;
  return ticketTitle.trim().toLowerCase().startsWith(customer.toLowerCase()) ? null : customer;
}

export function defaultTicketTaskSortDir(key: TicketTaskSortKey): SortDir {
  return key === 'created' ? 'desc' : 'asc';
}

export function filterTicketTaskRows(rows: TicketTaskTableRow[], filter: string): TicketTaskTableRow[] {
  if (filter === TASK_FILTER_ALL) return rows;
  if (filter === TASK_FILTER_UNASSIGNED) return rows.filter((row) => !row.assigneeEmail);
  const email = filter.toLowerCase();
  return rows.filter((row) => row.assigneeEmail?.toLowerCase() === email);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function compareInstant(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

/** Blank values (no due date, unassigned) stay at the bottom in both directions, like a spreadsheet. */
function compareBlankLast(
  a: string | null,
  b: string | null,
  compare: (x: string, y: string) => number,
  sign: number,
): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return sign * compare(a, b);
}

export function compareTicketTaskRows(
  a: TicketTaskTableRow,
  b: TicketTaskTableRow,
  key: TicketTaskSortKey,
  dir: SortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  let cmp = 0;
  switch (key) {
    case 'title':
      cmp = sign * compareText(a.title, b.title);
      break;
    case 'ticket':
      cmp =
        sign *
        (compareText(a.ticketTitle, b.ticketTitle) || compareText(a.ticketCustomer ?? '', b.ticketCustomer ?? ''));
      break;
    case 'assignee':
      cmp = compareBlankLast(a.assigneeEmail, b.assigneeEmail, compareText, sign);
      break;
    case 'due':
      cmp = compareBlankLast(a.dueAt, b.dueAt, compareInstant, sign);
      break;
    case 'status':
      cmp = sign * (Number(b.overdue) - Number(a.overdue)) || compareBlankLast(a.dueAt, b.dueAt, compareInstant, 1);
      break;
    case 'created':
      cmp = sign * compareInstant(a.createdAt, b.createdAt);
      break;
    default: {
      const _n: never = key;
      return _n;
    }
  }
  return cmp || compareText(a.title, b.title) || a.id.localeCompare(b.id);
}

export function sortTicketTaskRows(
  rows: TicketTaskTableRow[],
  key: TicketTaskSortKey,
  dir: SortDir,
): TicketTaskTableRow[] {
  return [...rows].sort((a, b) => compareTicketTaskRows(a, b, key, dir));
}
