import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export async function TicketTasksSection({ sectionId, jobId }: { sectionId: string; jobId: string }) {
  const tasks = await prisma.task.findMany({
    where: { jobId },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 100,
  });

  const open = tasks.filter((t) => t.status === 'OPEN');
  const done = tasks.filter((t) => t.status === 'DONE');

  return (
    <section id={sectionId} className="card border rounded-3 p-4 bg-body">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <h2 className="h6 fw-semibold mb-0">Tasks</h2>
        <Link href="/dashboard/tasks" className="btn btn-sm btn-outline-secondary">
          All tasks
        </Link>
      </div>
      <p className="small text-body-secondary mb-3">Tasks are separate from ticket status, but can link here for tracking.</p>

      <form action="/api/tasks" method="post" className="d-flex flex-column gap-2 mb-3">
        <input type="hidden" name="jobId" value={jobId} />
        <input className="form-control" name="title" placeholder="Add a task for this ticket" required />
        <textarea className="form-control" name="notes" placeholder="Notes (optional)" rows={2} />
        <div>
          <button className="btn btn-toolbar" type="submit">
            Add task
          </button>
        </div>
      </form>

      <div className="border rounded-2 overflow-hidden">
        <div className="px-3 py-2 border-bottom bg-body-secondary bg-opacity-25 small fw-semibold">
          Open ({open.length})
        </div>
        <div className="p-3">
          {open.length === 0 ? (
            <p className="small text-body-secondary mb-0">No open tasks for this ticket.</p>
          ) : (
            <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
              {open.map((t) => (
                <li key={t.id} className="d-flex align-items-start justify-content-between gap-2">
                  <div>
                    <div className="fw-semibold">{t.title}</div>
                    {t.notes ? <div className="small text-body-secondary">{t.notes}</div> : null}
                  </div>
                  <form action={`/api/tasks/${t.id}/toggle`} method="post">
                    <button className="btn btn-sm btn-outline-secondary" type="submit">
                      Done
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {done.length > 0 ? (
        <div className="border rounded-2 overflow-hidden mt-3">
          <div className="px-3 py-2 border-bottom bg-body-secondary bg-opacity-25 small fw-semibold">
            Done ({done.length})
          </div>
          <div className="p-3">
            <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
              {done.map((t) => (
                <li key={t.id} className="d-flex align-items-start justify-content-between gap-2">
                  <div className="text-body-secondary">
                    <div className="fw-semibold">{t.title}</div>
                    {t.notes ? <div className="small text-body-secondary">{t.notes}</div> : null}
                  </div>
                  <form action={`/api/tasks/${t.id}/toggle`} method="post">
                    <button className="btn btn-sm btn-outline-secondary" type="submit">
                      Reopen
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

