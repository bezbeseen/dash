'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  isTasksSubRoute,
  WORKFLOW_TABS,
  workflowTabCount,
  workflowTabFromPathname,
  type WorkflowTabCounts,
} from '@/lib/domain/workflow-tabs';

type Props = {
  counts: WorkflowTabCounts;
};

export function WorkflowTabs({ counts }: Props) {
  const pathname = usePathname() ?? '';
  const activeTab = workflowTabFromPathname(pathname);
  const showTaskSubtabs = isTasksSubRoute(pathname);

  if (activeTab == null) return null;

  return (
    <div className="workflow-tabs-shell">
      <nav className="workflow-tabs" aria-label="Work">
        {WORKFLOW_TABS.map((tab) => {
          const active = activeTab === tab.key;
          const count = workflowTabCount(counts, tab.countKey);
          return (
            <Link
              key={tab.key}
              href={tab.href as never}
              className={`workflow-tab${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="workflow-tab-label">{tab.label}</span>
              {count > 0 ? (
                <span className="workflow-tab-count" aria-label={`${count} items`}>
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {showTaskSubtabs ? (
        <nav className="workflow-subtabs" aria-label="Tasks and to-dos">
          <Link
            href={'/dashboard/tasks' as never}
            className={`workflow-subtab${
              pathname === '/dashboard/tasks' || pathname.startsWith('/dashboard/tasks/') ? ' is-active' : ''
            }`}
            aria-current={pathname.startsWith('/dashboard/tasks') ? 'page' : undefined}
          >
            Ticket tasks
            {counts.openTasks > 0 ? (
              <span className="workflow-subtab-count">{counts.openTasks}</span>
            ) : null}
          </Link>
          <Link
            href={'/dashboard/todos' as never}
            className={`workflow-subtab${
              pathname === '/dashboard/todos' || pathname.startsWith('/dashboard/todos/') ? ' is-active' : ''
            }`}
            aria-current={pathname.startsWith('/dashboard/todos') ? 'page' : undefined}
          >
            To-dos
            {counts.openTodos > 0 ? (
              <span className="workflow-subtab-count">{counts.openTodos}</span>
            ) : null}
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
