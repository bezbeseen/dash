import { prisma } from '@/lib/db/prisma';
import { calendarDateInTimeZone } from '@/lib/todo/timezone';

export type CalendarOverlayKind = 'event' | 'todo';

export type CalendarOverlayItem = {
  id: string;
  kind: CalendarOverlayKind;
  title: string;
  ymd: string;
  startLabel: string;
  href: string | null;
  overdue: boolean;
  extra: string | null;
};

/** Same calendar day the to-do list uses (shop timezone). */
export function todoDueYmd(dueAt: Date, timeZone: string): string {
  return calendarDateInTimeZone(dueAt, timeZone);
}

export function overlayFromGoogleEvent(ev: {
  id: string;
  title: string;
  ymd: string;
  allDay: boolean;
  startLabel: string;
  htmlLink: string | null;
  calendarName: string;
}): CalendarOverlayItem {
  return {
    id: `event:${ev.id}`,
    kind: 'event',
    title: ev.title,
    ymd: ev.ymd,
    startLabel: ev.allDay ? 'All day' : ev.startLabel,
    href: ev.htmlLink,
    overdue: false,
    extra: ev.calendarName || null,
  };
}

export async function loadOpenTodoOverlay(opts: {
  timeZone: string;
  todayYmd: string;
  startYmd: string;
  endYmd: string;
}): Promise<CalendarOverlayItem[]> {
  const rows = await prisma.todo.findMany({
    where: { status: 'OPEN', dueAt: { not: null } },
    orderBy: [{ dueAt: 'asc' }, { title: 'asc' }],
    take: 250,
    select: { id: true, title: true, dueAt: true, assigneeEmail: true },
  });

  const out: CalendarOverlayItem[] = [];
  for (const row of rows) {
    if (!row.dueAt) continue;
    const dueYmd = todoDueYmd(row.dueAt, opts.timeZone);
    const overdue = dueYmd < opts.todayYmd;
    let ymd = dueYmd;
    if (ymd < opts.startYmd || ymd > opts.endYmd) {
      if (overdue && opts.todayYmd >= opts.startYmd && opts.todayYmd <= opts.endYmd) {
        ymd = opts.todayYmd;
      } else {
        continue;
      }
    }
    out.push({
      id: `todo:${row.id}:${ymd}`,
      kind: 'todo',
      title: row.title,
      ymd,
      startLabel: overdue ? 'Overdue' : 'To-do',
      href: '/dashboard/todos',
      overdue,
      extra: row.assigneeEmail,
    });
  }
  return out;
}

export function sortOverlayItems(a: CalendarOverlayItem, b: CalendarOverlayItem): number {
  if (a.kind !== b.kind) {
    if (a.kind === 'todo' && a.overdue) return -1;
    if (b.kind === 'todo' && b.overdue) return 1;
    if (a.kind === 'todo') return -1;
    if (b.kind === 'todo') return 1;
  }
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  return a.startLabel.localeCompare(b.startLabel) || a.title.localeCompare(b.title);
}

export function mergeOverlayItems(
  events: CalendarOverlayItem[],
  todos: CalendarOverlayItem[],
): CalendarOverlayItem[] {
  return [...todos, ...events].sort(sortOverlayItems);
}

export function groupOverlayByDay(items: CalendarOverlayItem[]): Map<string, CalendarOverlayItem[]> {
  const map = new Map<string, CalendarOverlayItem[]>();
  for (const item of items) {
    const list = map.get(item.ymd) ?? [];
    list.push(item);
    map.set(item.ymd, list);
  }
  for (const [ymd, list] of map) {
    map.set(ymd, list.slice().sort(sortOverlayItems));
  }
  return map;
}

/** Prefer to-dos in the visible chips so they are not crowded out by Google events. */
export function takeVisibleOverlay(items: CalendarOverlayItem[], limit: number): CalendarOverlayItem[] {
  const todos = items.filter((i) => i.kind === 'todo');
  const events = items.filter((i) => i.kind === 'event');
  const mixed = todos.length > 0 && events.length > 0;
  const todoCap = mixed ? Math.min(todos.length, Math.ceil(limit / 2)) : todos.length;
  const pickedTodos = todos.slice(0, todoCap);
  return [...pickedTodos, ...events].slice(0, limit);
}
