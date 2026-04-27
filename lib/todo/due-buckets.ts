import type { TaskStatus } from '@prisma/client';
import { calendarDateInTimeZone, todoListTimeZone } from '@/lib/todo/timezone';

export type OpenTodoBucket = 'overdue' | 'today' | 'upcoming' | 'nodate';

export type TodoListItem = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  dueAt: Date | null;
  assigneeEmail: string | null;
  createdByEmail: string;
  createdAt: Date;
  updatedAt: Date;
};

const BUCKET_ORDER: OpenTodoBucket[] = ['overdue', 'today', 'upcoming', 'nodate'];

const BUCKET_LABEL: Record<OpenTodoBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  nodate: 'No due date',
};

export function openDueBucket(
  dueAt: Date | null,
  now: Date,
  timeZone: string = todoListTimeZone(),
): OpenTodoBucket {
  if (!dueAt) return 'nodate';
  const today = calendarDateInTimeZone(now, timeZone);
  const due = calendarDateInTimeZone(dueAt, timeZone);
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'upcoming';
}

export function groupOpenTodosByBucket(
  open: TodoListItem[],
  now: Date,
  timeZone: string = todoListTimeZone(),
): { bucket: OpenTodoBucket; label: string; items: TodoListItem[] }[] {
  const byBucket: Record<OpenTodoBucket, TodoListItem[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    nodate: [],
  };
  for (const t of open) {
    byBucket[openDueBucket(t.dueAt, now, timeZone)].push(t);
  }
  const sorter = (a: TodoListItem, b: TodoListItem) => {
    const ad = a.dueAt ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueAt ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return a.title.localeCompare(b.title);
  };
  for (const k of BUCKET_ORDER) {
    byBucket[k].sort(sorter);
  }
  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    label: BUCKET_LABEL[bucket],
    items: byBucket[bucket],
  })).filter((g) => g.items.length > 0);
}

export { BUCKET_ORDER, BUCKET_LABEL };
