import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const LINKABLE_JOBS_LIMIT = 200;

function taskErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'title_required':
      return 'Add a title for the task.';
    case 'dueAt_invalid':
      return 'Due date was not valid; use yyyy-mm-dd or a full date/time.';
    case 'not_found':
      return 'That task no longer exists.';
    default:
      return code ? 'Something went wrong saving the task.' : null;
  }
}

type TasksPageProps = { searchParams: Promise<{ task_error?: string }> };

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const q = await searchParams;
  const taskError = taskErrorMessage(q.task_error);

  const [tasks, linkableJobs] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
      include: { job: { select: { id: true, projectName: true, customerName: true } } },
    }),
    prisma.job.findMany({
      where: { archivedAt: null },
      orderBy: [{ updatedAt: 'desc' }],
      take: LINKABLE_JOBS_LIMIT,
      select: { id: true, projectName: true, customerName: true },
    }),
  ]);

  const open = tasks.filter((t) => t.status === 'OPEN');
  const done = tasks.filter((t) => t.status === 'DONE');

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Tasks</h1>
          <p className="board-topbar-sub">Ticket follow-ups: optional link to a job, due date, and done/reopen.</p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard" className="btn btn-toolbar btn-toolbar-muted">
            Dashboard
          </Link>
          <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
            Settings
          </Link>
        </div>
      </header>

      {taskError ? (
        <div className="px-3 px-md-4 pt-2" role="alert">
          <div className="board-toast board-toast-error">{taskError}</div>
        </div>
      ) : null}

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-5" style={{ minHeight: 0 }}>
        <div className="card border rounded-3 p-4 bg-body mb-4">
          <h2 className="h6 fw-semibold mb-3">Add task</h2>
          <form action="/api/tasks" method="post" className="d-flex flex-column gap-2" style={{ maxWidth: 760 }}>
            <input className="form-control" name="title" placeholder="Task title" required />
            <textarea className="form-control" name="notes" placeholder="Notes (optional)" rows={2} />
            <div className="d-flex flex-wrap gap-2 align-items-start">
              <div className="flex-grow-1" style={{ minWidth: '14rem' }}>
                <label htmlFor="task-link-job" className="form-label small mb-1">
                  Link to ticket (optional)
                </label>
                <select className="form-select" id="task-link-job" name="jobId" defaultValue="">
                  <option value="">No link</option>
                  {linkableJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.projectName || 'Ticket'} {'\u00b7'} {j.customerName}
                    </option>
                  ))}
                </select>
                <p className="small text-body-secondary mb-0 mt-1">
                  Showing {linkableJobs.length} most recently updated open tickets.
                </p>
              </div>
              <div className="flex-grow-1" style={{ minWidth: '12rem' }}>
                <label htmlFor="task-due" className="form-label small mb-1">
                  Due (optional)
                </label>
                <input
                  className="form-control"
                  id="task-due"
                  name="dueAt"
                  placeholder="yyyy-mm-dd or ISO date"
                />
              </div>
            </div>
            <div>
              <button className="btn btn-toolbar" type="submit">
                Add
              </button>
            </div>
          </form>
          <p className="small text-body-secondary mb-0 mt-3">
            Need an older ticket? Open it from Tickets, then add the task on that ticket&apos;s page.
          </p>
        </div>

        <div className="card border rounded-3 overflow-hidden bg-body shadow-sm mb-4">
          <div className="card-body border-bottom py-3">
            <h2 className="h6 fw-semibold mb-0">Open ({open.length})</h2>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th className="ps-4">Task</th>
                  <th>Ticket</th>
                  <th className="text-end pe-4" style={{ width: '10rem' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {open.length === 0 ? (
                  <tr>
                    <td className="ps-4 py-4 text-body-secondary" colSpan={3}>
                      No open tasks.
                    </td>
                  </tr>
                ) : (
                  open.map((t) => (
                    <tr key={t.id}>
                      <td className="ps-4">
                        <div className="fw-semibold">{t.title}</div>
                        {t.notes ? <div className="small text-body-secondary">{t.notes}</div> : null}
                        <div className="small text-body-secondary detail-mono">{t.id}</div>
                      </td>
                      <td>
                        {t.job ? (
                          <Link className="text-decoration-none" href={`/dashboard/jobs/${t.job.id}`}>
                            {t.job.projectName || 'Ticket'}{' '}
                            <span className="text-body-secondary">({t.job.customerName})</span>
                          </Link>
                        ) : (
                          <span className="text-body-secondary">--</span>
                        )}
                      </td>
                      <td className="text-end pe-4">
                        <form action={`/api/tasks/${t.id}/toggle`} method="post">
                          <button className="btn btn-sm btn-outline-secondary" type="submit">
                            Mark done
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card border rounded-3 overflow-hidden bg-body shadow-sm">
          <div className="card-body border-bottom py-3">
            <h2 className="h6 fw-semibold mb-0">Done ({done.length})</h2>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th className="ps-4">Task</th>
                  <th>Ticket</th>
                  <th className="text-end pe-4" style={{ width: '10rem' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {done.length === 0 ? (
                  <tr>
                    <td className="ps-4 py-4 text-body-secondary" colSpan={3}>
                      No completed tasks yet.
                    </td>
                  </tr>
                ) : (
                  done.map((t) => (
                    <tr key={t.id}>
                      <td className="ps-4">
                        <div className="fw-semibold text-body-secondary">{t.title}</div>
                        {t.notes ? <div className="small text-body-secondary">{t.notes}</div> : null}
                        <div className="small text-body-secondary detail-mono">{t.id}</div>
                      </td>
                      <td>
                        {t.job ? (
                          <Link className="text-decoration-none" href={`/dashboard/jobs/${t.job.id}`}>
                            {t.job.projectName || 'Ticket'}{' '}
                            <span className="text-body-secondary">({t.job.customerName})</span>
                          </Link>
                        ) : (
                          <span className="text-body-secondary">--</span>
                        )}
                      </td>
                      <td className="text-end pe-4">
                        <form action={`/api/tasks/${t.id}/toggle`} method="post">
                          <button className="btn btn-sm btn-outline-secondary" type="submit">
                            Reopen
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

