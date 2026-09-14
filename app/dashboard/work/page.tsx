import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DashboardHomeTodos } from '@/components/dashboard-home-todos';
import { DashboardWorkList } from '@/components/dashboard-work-list';
import { loadDashboardTodosModule } from '@/lib/domain/dashboard-home-todos';
import { loadDashboardSummary } from '@/lib/domain/dashboard-summary';
import { loadDashboardWorkList } from '@/lib/domain/dashboard-work-list';
import { jobErrorFromQuery } from '@/lib/domain/integration-query-toasts';
import { prisma } from '@/lib/db/prisma';
import { loadTodoAssigneeOptions } from '@/lib/todo/assignee-options';
import { todoFormErrorMessage } from '@/lib/todo/todo-form-errors';

export const dynamic = 'force-dynamic';

type WorkPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryString(
  q: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = q[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const q = await searchParams;
  const todoError = todoFormErrorMessage(firstQueryString(q, 'todo_error'));
  const jobError = jobErrorFromQuery({ job_error: firstQueryString(q, 'job_error') });

  const session = await getServerSession(authOptions);
  const sessionEmail = (session?.user?.email ?? '').toLowerCase() || null;

  const [summary, todosModule, assigneeOptions, workList] = await Promise.all([
    loadDashboardSummary(),
    loadDashboardTodosModule(sessionEmail, { upcomingLimit: 40 }),
    loadTodoAssigneeOptions(prisma, sessionEmail),
    loadDashboardWorkList(),
  ]);

  return (
    <div className="board-page work-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Work</h1>
          <p className="board-topbar-sub">
            Jobs and shop to-dos. Open{' '}
            <Link href="/dashboard/tickets" className="text-decoration-underline">
              Tickets
            </Link>{' '}
            for the kanban board.
          </p>
        </div>
      </header>

      {todoError || jobError ? (
        <div className="px-3 px-md-4 pb-2" role="alert">
          {todoError ? <div className="board-toast board-toast-error">{todoError}</div> : null}
          {jobError ? <div className="board-toast board-toast-error">{jobError}</div> : null}
        </div>
      ) : null}

      <div className="work-page-body">
        <div className="work-page-main">
          <DashboardWorkList work={workList} leadCount={summary.leadCount} />
        </div>
        <div className="work-page-side">
          <DashboardHomeTodos module={todosModule} assigneeOptions={assigneeOptions} className="shadow-sm mb-0" />
        </div>
      </div>
    </div>
  );
}
