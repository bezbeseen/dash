/**
 * Work tab ticket task table: assignee filter, column sort, and assignee helpers (no DB).
 * Run `npm run verify:ticket-task-table` after changing those modules.
 */
import {
  defaultTicketTaskSortDir,
  filterTicketTaskRows,
  sortTicketTaskRows,
  TASK_FILTER_ALL,
  TASK_FILTER_UNASSIGNED,
  ticketCustomerLine,
  type TicketTaskSortKey,
  type TicketTaskTableRow,
} from '../lib/domain/ticket-task-table';
import { emailLocalPart, isAllowedAssigneeEmail } from '../lib/todo/assignee-options';
import { workspaceDomain } from '../lib/workspace-domain';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
  }
}

const domain = workspaceDomain();
const ana = `ana@${domain}`;
const ben = `ben@${domain}`;

function row(id: string, over: Partial<TicketTaskTableRow>): TicketTaskTableRow {
  return {
    id,
    title: id,
    notes: null,
    jobId: `job-${id}`,
    ticketTitle: 'Window graphics',
    ticketCustomer: 'Kollab',
    assigneeEmail: null,
    dueAt: null,
    dueLabel: null,
    overdue: false,
    createdAt: '2026-10-01T12:00:00.000Z',
    createdLabel: 'Oct 1, 2026',
    createdByEmail: ana,
    ...over,
  };
}

const rows: TicketTaskTableRow[] = [
  row('a', {
    title: 'Order vinyl',
    assigneeEmail: ben,
    dueAt: '2026-10-09T00:00:00.000Z',
    createdAt: '2026-10-03T12:00:00.000Z',
    ticketTitle: 'Storefront sign',
  }),
  row('b', {
    title: 'call customer',
    assigneeEmail: ana,
    dueAt: '2026-10-01T00:00:00.000Z',
    overdue: true,
    createdAt: '2026-09-20T12:00:00.000Z',
  }),
  row('c', { title: 'Proof layout', createdAt: '2026-10-05T12:00:00.000Z', ticketTitle: 'Banner' }),
  row('d', {
    title: 'Install',
    assigneeEmail: ben,
    dueAt: '2026-10-20T00:00:00.000Z',
    createdAt: '2026-10-02T12:00:00.000Z',
  }),
];

const ids = (list: TicketTaskTableRow[]) => list.map((r) => r.id);
const sorted = (key: TicketTaskSortKey, dir: 'asc' | 'desc') => ids(sortTicketTaskRows(rows, key, dir));

// ---- assignee filter
check('filter: all keeps every row', ids(filterTicketTaskRows(rows, TASK_FILTER_ALL)), ['a', 'b', 'c', 'd']);
check('filter: unassigned', ids(filterTicketTaskRows(rows, TASK_FILTER_UNASSIGNED)), ['c']);
check('filter: one person', ids(filterTicketTaskRows(rows, ben)), ['a', 'd']);
check('filter: person match ignores case', ids(filterTicketTaskRows(rows, ana.toUpperCase())), ['b']);
check('filter: nobody assigned to that person', ids(filterTicketTaskRows(rows, `zed@${domain}`)), []);

// ---- sorting
check('sort: due soonest first, no date last', sorted('due', 'asc'), ['b', 'a', 'd', 'c']);
check('sort: due latest first, no date still last', sorted('due', 'desc'), ['d', 'a', 'b', 'c']);
check('sort: title A-Z ignores case', sorted('title', 'asc'), ['b', 'd', 'a', 'c']);
check('sort: title Z-A', sorted('title', 'desc'), ['c', 'a', 'd', 'b']);
check('sort: assignee A-Z, unassigned last, ties by title', sorted('assignee', 'asc'), ['b', 'd', 'a', 'c']);
check('sort: assignee Z-A, unassigned still last', sorted('assignee', 'desc'), ['d', 'a', 'b', 'c']);
check('sort: ticket A-Z, ties by title', sorted('ticket', 'asc'), ['c', 'a', 'b', 'd']);
check('sort: overdue first, then by due date', sorted('status', 'asc'), ['b', 'a', 'd', 'c']);
check('sort: overdue last when reversed', sorted('status', 'desc'), ['a', 'd', 'c', 'b']);
check('sort: created newest first', sorted('created', 'desc'), ['c', 'a', 'd', 'b']);
check('sort: created oldest first', sorted('created', 'asc'), ['b', 'd', 'a', 'c']);
check('sort: does not mutate the input', ids(rows), ['a', 'b', 'c', 'd']);
check(
  'sort: identical rows fall back to id',
  ids(sortTicketTaskRows([row('y', { title: 'Same' }), row('x', { title: 'Same' })], 'due', 'asc')),
  ['x', 'y'],
);

check('default dir: created starts newest first', defaultTicketTaskSortDir('created'), 'desc');
check('default dir: due starts soonest first', defaultTicketTaskSortDir('due'), 'asc');
check('default dir: title starts A-Z', defaultTicketTaskSortDir('title'), 'asc');

// ---- ticket customer line
check('customer line: shown under a shop title', ticketCustomerLine('Window graphics', 'Kollab'), 'Kollab');
check('customer line: hidden when the title is the customer', ticketCustomerLine('Jane Doe', 'Jane Doe'), null);
check('customer line: hidden for "Customer #1263" titles', ticketCustomerLine('Jane Doe #1263', 'jane doe'), null);
check('customer line: blank customer', ticketCustomerLine('Window graphics', '  '), null);

// ---- assignee helpers shared with to-dos
check('assignee: blank means unassigned', isAllowedAssigneeEmail(''), true);
check('assignee: null means unassigned', isAllowedAssigneeEmail(null), true);
check('assignee: workspace email allowed', isAllowedAssigneeEmail(ben), true);
check('assignee: other domain rejected', isAllowedAssigneeEmail('ben@gmail.com'), false);
check('assignee: short label is the local part', emailLocalPart(ben), 'ben');

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll ticket task table checks passed.');
