'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SortableTh, type SortDir } from '@/components/sortable-th';
import { TaskAssigneeSelect } from '@/components/task-assignee-select';
import { TaskDoneButton } from '@/components/task-done-button';
import type { DashboardTicketTasksModule } from '@/lib/domain/dashboard-ticket-tasks';
import {
  defaultTicketTaskSortDir,
  filterTicketTaskRows,
  sortTicketTaskRows,
  TASK_FILTER_ALL,
  TASK_FILTER_UNASSIGNED,
  type TicketTaskSortKey,
} from '@/lib/domain/ticket-task-table';
import { emailLocalPart } from '@/lib/todo/assignee-options';

type Props = {
  module: DashboardTicketTasksModule;
  assigneeOptions: string[];
  sessionEmail: string | null;
  className?: string;
};

export function DashboardTicketTasks({ module: m, assigneeOptions, sessionEmail, className }: Props) {
  const mine = sessionEmail?.toLowerCase() ?? null;
  const [filter, setFilter] = useState<string>(TASK_FILTER_ALL);
  const [sortKey, setSortKey] = useState<TicketTaskSortKey>('due');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const shown = useMemo(
    () => sortTicketTaskRows(filterTicketTaskRows(m.rows, filter), sortKey, sortDir),
    [m.rows, filter, sortKey, sortDir],
  );
  const personFilter = filter === TASK_FILTER_ALL || filter === TASK_FILTER_UNASSIGNED ? '' : filter;

  function sortBy(key: TicketTaskSortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(defaultTicketTaskSortDir(key));
  }

  const filterButton = (value: string, label: string) => (
    <button
      type="button"
      className={`btn ${filter === value ? 'btn-primary' : 'btn-outline-secondary'}`}
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
    >
      {label}
    </button>
  );

  return (
    <section
      className={['dash-module work-tasks-module card border rounded-3 bg-body', className ?? 'mb-4']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="dash-module-head d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div>
          <h2 className="h6 fw-semibold mb-1 d-flex align-items-center gap-2">
            <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
              checklist
            </i>
            Ticket tasks
          </h2>
          <p className="text-body-secondary small mb-0">
            <span className="fw-semibold text-body">{m.openTotal}</span> open
            {m.openMine > 0 ? (
              <>
                {' '}
                ·{' '}
                <span className="fw-semibold text-body">{m.openMine}</span> assigned to you
              </>
            ) : null}
            {m.openOverdue > 0 ? (
              <>
                {' '}
                ·{' '}
                <span className="text-danger fw-semibold">{m.openOverdue}</span> overdue
              </>
            ) : null}
            {filter !== TASK_FILTER_ALL ? (
              <>
                {' '}
                ·{' '}
                <span className="fw-semibold text-body">{shown.length}</span> shown
              </>
            ) : null}
          </p>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          {m.rows.length > 0 ? (
            <>
              <div className="btn-group btn-group-sm" role="group" aria-label="Filter tasks by assignee">
                {filterButton(TASK_FILTER_ALL, 'All')}
                {mine ? filterButton(mine, 'Mine') : null}
                {filterButton(TASK_FILTER_UNASSIGNED, 'Unassigned')}
              </div>
              <select
                className="form-select form-select-sm w-auto"
                aria-label="Filter tasks by person"
                value={personFilter}
                onChange={(e) => setFilter(e.target.value || TASK_FILTER_ALL)}
              >
                <option value="">Person…</option>
                {assigneeOptions.map((email) => (
                  <option key={email} value={email}>
                    {emailLocalPart(email)}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <Link href="/dashboard/tasks" className="btn btn-sm btn-outline-secondary">
            All tasks
          </Link>
        </div>
      </div>

      {m.rows.length === 0 ? (
        <div className="dash-module-scroll">
          <p className="small text-body-secondary px-3 pb-3 mb-0">
            No open ticket tasks. Add one from a ticket&apos;s Tasks section or the{' '}
            <Link href="/dashboard/tasks" className="text-decoration-underline">
              Tasks
            </Link>{' '}
            page.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="dash-module-scroll">
          <p className="small text-body-secondary px-3 pb-3 mb-0">
            {filter === mine
              ? 'No open tasks assigned to you.'
              : filter === TASK_FILTER_UNASSIGNED
                ? 'Every open task has an owner.'
                : 'No open tasks for this person.'}
          </p>
        </div>
      ) : (
        <div className="dash-module-scroll">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead className="table-light">
              <tr className="small text-body-secondary">
                <SortableTh label="Task" column="title" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} className="ps-3" />
                <SortableTh label="Ticket" column="ticket" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                <SortableTh label="Assignee" column="assignee" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                <SortableTh label="Due" column="due" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} className="pe-3" />
                <SortableTh
                  label="Status"
                  column="status"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={sortBy}
                  className="work-tasks-wide-col"
                />
                <SortableTh
                  label="Created"
                  column="created"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={sortBy}
                  align="end"
                  className="pe-3 work-tasks-wide-col"
                />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <td className="ps-3 py-2">
                    <div className="d-flex align-items-start gap-2">
                      <TaskDoneButton taskId={row.id} />
                      <div style={{ minWidth: 0 }}>
                        <div className="fw-semibold text-break">{row.title}</div>
                        {row.notes ? (
                          <div
                            className="small text-body-secondary text-truncate"
                            style={{ maxWidth: 180 }}
                            title={row.notes}
                          >
                            {row.notes}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/dashboard/jobs/${row.jobId}`}
                      className="text-decoration-none text-body fw-semibold d-block text-truncate"
                      style={{ maxWidth: 200 }}
                    >
                      {row.ticketTitle}
                    </Link>
                    {row.ticketCustomer ? (
                      <div className="small text-body-secondary text-truncate" style={{ maxWidth: 200 }}>
                        {row.ticketCustomer}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <TaskAssigneeSelect
                      taskId={row.id}
                      assigneeEmail={row.assigneeEmail}
                      options={assigneeOptions}
                      label={`Assignee for ${row.title}`}
                    />
                  </td>
                  <td className="pe-3 py-2 small text-nowrap">
                    {row.dueLabel ? (
                      <span className={row.overdue ? 'text-danger fw-semibold' : undefined}>{row.dueLabel}</span>
                    ) : (
                      <span className="text-body-secondary">—</span>
                    )}
                  </td>
                  <td className="py-2 work-tasks-wide-col">
                    <span
                      className={`badge rounded-pill fw-semibold ${
                        row.overdue ? 'bg-danger-subtle text-danger-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'
                      }`}
                    >
                      {row.overdue ? 'Overdue' : 'Open'}
                    </span>
                  </td>
                  <td className="pe-3 py-2 small text-body-secondary text-end text-nowrap work-tasks-wide-col">
                    <div>{row.createdLabel}</div>
                    <div title={row.createdByEmail}>by {emailLocalPart(row.createdByEmail)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {m.openTotal > m.rows.length ? (
        <div className="dash-module-foot small text-body-secondary">
          Showing {m.rows.length} of {m.openTotal}.{' '}
          <Link href="/dashboard/tasks" className="text-decoration-underline">
            See all tasks
          </Link>
          .
        </div>
      ) : null}
    </section>
  );
}
