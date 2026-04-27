import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { loadTodoAssigneeOptions } from '@/lib/todo/assignee-options';
import { groupOpenTodosByBucket, type TodoListItem } from '@/lib/todo/due-buckets';
import { calendarDateInTimeZone, todoListTimeZone } from '@/lib/todo/timezone';

export const dynamic = 'force-dynamic';

function todoErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'title_required':
      return 'Add a title for the to-do.';
    case 'dueAt_invalid':
      return 'Due date was not valid; use the date picker or yyyy-mm-dd.';
    case 'assignee_invalid':
      return 'Assignee must be a Google Workspace email for your organization, or leave unassigned.';
    case 'not_found':
      return 'That to-do no longer exists.';
    default:
      return code ? 'Something went wrong saving the to-do.' : null;
  }
}

type TodosPageProps = {
  searchParams: Promise<{ todo_error?: string; filter?: string }>;
};

export default async function TodosPage({ searchParams }: TodosPageProps) {
  const q = await searchParams;
  const todoError = todoErrorMessage(q.todo_error);
  const filter = (q.filter ?? 'all').toLowerCase();
  const timeZone = todoListTimeZone();

  const session = await getServerSession(authOptions);
  const sessionEmail = (session?.user?.email ?? '').toLowerCase();

  const whereOpen: Prisma.TodoWhereInput = { status: 'OPEN' };
  if (filter === 'me' && sessionEmail) {
    whereOpen.assigneeEmail = sessionEmail;
  } else if (filter === 'unassigned') {
    whereOpen.assigneeEmail = null;
  }

  const [openRaw, done, assigneeOptions] = await Promise.all([
    prisma.todo.findMany({
      where: whereOpen,
      take: 300,
    }),
    prisma.todo.findMany({
      where: { status: 'DONE' },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    }),
    loadTodoAssigneeOptions(prisma, sessionEmail || null),
  ]);

  const now = new Date();
  const open: TodoListItem[] = openRaw.map((t) => ({ ...t }));
  const grouped = groupOpenTodosByBucket(open, now, timeZone);

  const buildFilterHref = (f: string) =>
    f === 'all' ? '/dashboard/todos' : `/dashboard/todos?filter=${encodeURIComponent(f)}`;

  const dateInputValue = (d: Date | null) => (d ? calendarDateInTimeZone(d, timeZone) : '');
  const formatDue = (d: Date | null) =>
    d
      ? d.toLocaleDateString('en-US', {
          timeZone,
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '—';

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">To-dos</h1>
          <p className="board-topbar-sub">
            Shop-wide list: assign a teammate, set a due date, check off when complete. (Ticket follow-ups
            with an optional job link live under{' '}
            <Link className="text-decoration-none" href="/dashboard/tasks">
              Tasks
            </Link>
            .)
          </p>
        </div>
        <div className="board-topbar-actions d-flex flex-wrap gap-2">
          <div className="btn-group" role="group" aria-label="Filter to-dos">
            <Link
              href={buildFilterHref('all') as never}
              className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
            >
              All
            </Link>
            <Link
              href={buildFilterHref('me') as never}
              className={`btn btn-sm ${filter === 'me' ? 'btn-primary' : 'btn-outline-secondary'}`}
            >
              Assigned to me
            </Link>
            <Link
              href={buildFilterHref('unassigned') as never}
              className={`btn btn-sm ${filter === 'unassigned' ? 'btn-primary' : 'btn-outline-secondary'}`}
            >
              Unassigned
            </Link>
          </div>
          <Link href="/dashboard" className="btn btn-toolbar btn-toolbar-muted">
            Dashboard
          </Link>
          <Link href="/dashboard/tasks" className="btn btn-toolbar btn-toolbar-muted">
            Tasks
          </Link>
        </div>
      </header>

      {todoError ? (
        <div className="px-3 px-md-4 pt-2" role="alert">
          <div className="board-toast board-toast-error">{todoError}</div>
        </div>
      ) : null}

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-5" style={{ minHeight: 0 }}>
        <div className="card border rounded-3 p-4 bg-body mb-4">
          <h2 className="h6 fw-semibold mb-2">Add a to-do</h2>
          <p className="small text-body-secondary mb-3">
            Optional list in <code className="detail-mono">TODO_ASSIGNEE_EMAILS</code> (comma-separated) seeds
            the assignee menu before anyone appears from history.
          </p>
          <form
            action="/api/todos"
            method="post"
            className="d-flex flex-column gap-2"
            style={{ maxWidth: 800 }}
          >
            <div className="d-flex flex-wrap gap-2">
              <input
                className="form-control flex-grow-1"
                name="title"
                placeholder="What needs to be done?"
                required
                style={{ minWidth: '12rem' }}
              />
            </div>
            <textarea className="form-control" name="notes" placeholder="Notes (optional)" rows={2} />
            <div className="d-flex flex-wrap gap-3 align-items-end">
              <div style={{ minWidth: '12rem' }}>
                <label className="form-label small mb-1" htmlFor="todo-new-assignee">
                  Assign
                </label>
                <select className="form-select" id="todo-new-assignee" name="assigneeEmail" defaultValue="">
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: '11rem' }}>
                <label className="form-label small mb-1" htmlFor="todo-new-due">
                  Due (optional)
                </label>
                <input
                  className="form-control"
                  id="todo-new-due"
                  name="dueAt"
                  type="date"
                  min="2000-01-01"
                />
              </div>
            </div>
            <div>
              <button className="btn btn-toolbar" type="submit">
                Add
              </button>
            </div>
          </form>
        </div>

        {open.length === 0 ? (
          <div className="card border rounded-3 p-4 bg-body text-body-secondary">
            {filter === 'me'
              ? 'No open to-dos assigned to you. Try the All or Unassigned filter, or add one above.'
              : filter === 'unassigned'
                ? 'No unassigned open to-dos. Everything has an owner (or is done).'
                : 'No open to-dos. Add your first one above.'}
          </div>
        ) : (
          grouped.map(({ bucket, label, items }) => (
            <div key={bucket} className="mb-4">
              <h2 className="h6 text-uppercase text-body-secondary fw-semibold small mb-2 d-flex align-items-baseline justify-content-between gap-2">
                <span>{label}</span>
                <span className="badge bg-body-secondary text-body rounded-pill">{items.length}</span>
              </h2>
              <ul className="list-group list-group-flush border rounded-3 overflow-hidden bg-body">
                {items.map((t) => (
                  <li
                    key={t.id}
                    className="list-group-item list-group-item-action p-0 border-start-0 border-end-0"
                  >
                    <div className="d-flex flex-column flex-lg-row flex-wrap align-items-stretch align-items-lg-start gap-2 p-3">
                      <div
                        className="d-flex align-items-start gap-2 flex-grow-1"
                        style={{ minWidth: 0, flex: '1 1 12rem' }}
                      >
                        <form action={`/api/todos/${t.id}/toggle`} method="post" className="d-inline">
                          <button className="btn btn-sm btn-outline-success" type="submit" title="Mark done">
                            Done
                          </button>
                        </form>
                        <form
                          action={`/api/todos/${t.id}/update`}
                          method="post"
                          className="d-flex flex-column flex-md-row flex-wrap align-items-stretch flex-grow-1 gap-2"
                          style={{ minWidth: 0 }}
                        >
                          <div className="flex-grow-1" style={{ minWidth: 0 }}>
                            <input
                              className="form-control form-control-sm mb-1 fw-semibold"
                              name="title"
                              defaultValue={t.title}
                              required
                            />
                            <textarea
                              className="form-control form-control-sm"
                              name="notes"
                              placeholder="Notes"
                              rows={2}
                              defaultValue={t.notes ?? ''}
                            />
                          </div>
                          <div className="d-flex flex-wrap gap-2 align-items-end">
                            <div style={{ minWidth: '10rem' }}>
                              <span className="form-label small mb-0 d-block text-body-secondary">Assign</span>
                              <select
                                className="form-select form-select-sm"
                                name="assigneeEmail"
                                defaultValue={t.assigneeEmail ?? ''}
                                aria-label="Assignee"
                              >
                                <option value="">Unassigned</option>
                                {assigneeOptions.map((e) => (
                                  <option key={e} value={e}>
                                    {e}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ minWidth: '8.5rem' }}>
                              <span className="form-label small mb-0 d-block text-body-secondary">Due</span>
                              <input
                                className="form-control form-control-sm"
                                name="dueAt"
                                type="date"
                                defaultValue={dateInputValue(t.dueAt)}
                                min="2000-01-01"
                                aria-label="Due date"
                              />
                            </div>
                            <button className="btn btn-sm btn-outline-primary" type="submit">
                              Save
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        {done.length > 0 ? (
          <div className="card border rounded-3 overflow-hidden bg-body shadow-sm mt-4">
            <div className="card-body border-bottom py-3">
              <h2 className="h6 fw-semibold mb-0">Done (recent {done.length})</h2>
            </div>
            <ul className="list-group list-group-flush">
              {done.map((t) => (
                <li
                  key={t.id}
                  className="list-group-item d-flex flex-column flex-md-row flex-wrap justify-content-between gap-2 align-items-md-center"
                >
                  <div>
                    <div className="text-body-secondary text-decoration-line-through">{t.title}</div>
                    {t.notes ? <div className="small text-body-secondary">{t.notes}</div> : null}
                    <div className="small text-body-secondary">
                      {t.assigneeEmail ? (
                        <span>Assigned: {t.assigneeEmail}</span>
                      ) : (
                        <span>Unassigned</span>
                      )}{' '}
                      · Due {formatDue(t.dueAt)}
                    </div>
                  </div>
                  <form action={`/api/todos/${t.id}/toggle`} method="post">
                    <button className="btn btn-sm btn-outline-secondary" type="submit">
                      Reopen
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
