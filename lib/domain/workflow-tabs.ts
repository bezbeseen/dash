export type WorkflowTabKey = 'prequote' | 'tickets' | 'tasks' | 'done';

export type WorkflowTabCounts = {
  prequote: number;
  tickets: number;
  openTasks: number;
  openTodos: number;
  done: number;
};

export function workflowTabFromPathname(pathname: string): WorkflowTabKey | null {
  if (pathname === '/dashboard/prequoted' || pathname.startsWith('/dashboard/prequoted/')) {
    return 'prequote';
  }
  if (
    pathname === '/dashboard/tickets' ||
    pathname.startsWith('/dashboard/tickets/') ||
    pathname.startsWith('/dashboard/jobs/')
  ) {
    return 'tickets';
  }
  if (
    pathname === '/dashboard/tasks' ||
    pathname.startsWith('/dashboard/tasks/') ||
    pathname === '/dashboard/todos' ||
    pathname.startsWith('/dashboard/todos/')
  ) {
    return 'tasks';
  }
  if (pathname === '/dashboard/done' || pathname.startsWith('/dashboard/done/')) {
    return 'done';
  }
  return null;
}

export function isWorkflowRoute(pathname: string): boolean {
  return workflowTabFromPathname(pathname) != null;
}

export function isTasksSubRoute(pathname: string): boolean {
  return (
    pathname === '/dashboard/tasks' ||
    pathname.startsWith('/dashboard/tasks/') ||
    pathname === '/dashboard/todos' ||
    pathname.startsWith('/dashboard/todos/')
  );
}

export const WORKFLOW_TABS: {
  key: WorkflowTabKey;
  label: string;
  href: string;
  countKey: keyof WorkflowTabCounts | 'tasksTodos';
}[] = [
  { key: 'prequote', label: 'Pre-quote', href: '/dashboard/prequoted', countKey: 'prequote' },
  { key: 'tickets', label: 'Tickets', href: '/dashboard/tickets', countKey: 'tickets' },
  { key: 'tasks', label: 'Tasks & To-dos', href: '/dashboard/tasks', countKey: 'tasksTodos' },
  { key: 'done', label: 'Done', href: '/dashboard/done', countKey: 'done' },
];

export function workflowTabCount(
  counts: WorkflowTabCounts,
  countKey: (typeof WORKFLOW_TABS)[number]['countKey'],
): number {
  if (countKey === 'tasksTodos') return counts.openTasks + counts.openTodos;
  return counts[countKey];
}
