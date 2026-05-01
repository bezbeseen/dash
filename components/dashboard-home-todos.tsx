import Link from 'next/link';
import type { DashboardTodosModule } from '@/lib/domain/dashboard-home-todos';
import { todoListTimeZone } from '@/lib/todo/timezone';

type Props = {
  module: DashboardTodosModule;
  assigneeOptions: string[];
};

function formatDue(d: Date | null, timeZone: string) {
  if (!d) return null;
  return d.toLocaleDateString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DashboardHomeTodos({ module: m, assigneeOptions }: Props) {
  const tz = todoListTimeZone();
  const now = new Date();

  return (
    <section className="card border rounded-3 p-4 mb-4 bg-body">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
        <div>
          <h2 className="h6 fw-semibold mb-1 d-flex align-items-center gap-2">
            <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
              event_note
            </i>
            Shop to-dos
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
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link href={'/dashboard/todos' as never} className="btn btn-sm btn-outline-secondary">
            All to-dos
          </Link>
          <Link href={'/dashboard/todos?filter=me' as never} className="btn btn-sm btn-outline-secondary">
            Mine
          </Link>
        </div>
      </div>

      <form
        action="/api/todos"
        method="post"
        className="d-flex flex-column flex-lg-row flex-wrap gap-2 align-items-stretch align-items-lg-end mb-4"
      >
        <div className="flex-grow-1" style={{ minWidth: '10rem' }}>
          <label className="form-label small mb-1" htmlFor="dashboard-todo-title">
            Quick add
          </label>
          <input
            id="dashboard-todo-title"
            className="form-control form-control-sm"
            name="title"
            placeholder="What needs to be done?"
            required
            autoComplete="off"
          />
        </div>
        <div style={{ minWidth: '10rem' }}>
          <label className="form-label small mb-1" htmlFor="dashboard-todo-assignee">
            Assign
          </label>
          <select className="form-select form-select-sm" id="dashboard-todo-assignee" name="assigneeEmail" defaultValue="">
            <option value="">Unassigned</option>
            {assigneeOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: '9rem' }}>
          <label className="form-label small mb-1" htmlFor="dashboard-todo-due">
            Due
          </label>
          <input
            id="dashboard-todo-due"
            className="form-control form-control-sm"
            name="dueAt"
            type="date"
            min="2000-01-01"
          />
        </div>
        <button type="submit" className="btn btn-primary btn-sm">
          Add
        </button>
      </form>

      {m.upcoming.length === 0 ? (
        <p className="text-body-secondary small mb-0">No open to-dos. Add one above or on the full list.</p>
      ) : (
        <ul className="list-group list-group-flush border rounded-2 overflow-hidden mb-0">
          {m.upcoming.map((t) => {
            const dueLabel = formatDue(t.dueAt, tz);
            const overdue = t.dueAt != null && t.dueAt < now;
            return (
              <li key={t.id} className="list-group-item d-flex flex-column flex-sm-row gap-2 align-items-sm-center py-3">
                <form action={`/api/todos/${t.id}/toggle`} method="post" className="flex-shrink-0">
                  <button className="btn btn-sm btn-outline-success" type="submit" title="Mark done">
                    Done
                  </button>
                </form>
                <div className="flex-grow-1 min-w-0">
                  <div className="fw-medium text-break">{t.title}</div>
                  <div className="small text-body-secondary">
                    {dueLabel ? (
                      <span className={overdue ? 'text-danger fw-semibold' : undefined}>{dueLabel}</span>
                    ) : (
                      'No due date'
                    )}
                    {t.assigneeEmail ? (
                      <>
                        {' '}
                        · {t.assigneeEmail}
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
