import { loadGoogleCalendarMonth } from '@/lib/calendar/google-calendar';
import { pickCalendarMailbox, type CalendarMailbox } from '@/lib/calendar/mailbox';
import { addDaysYmd } from '@/lib/calendar/month-grid';
import {
  groupOverlayByDay,
  loadOpenTodoOverlay,
  mergeOverlayItems,
  overlayFromGoogleEvent,
  type CalendarOverlayItem,
} from '@/lib/calendar/overlay';
import { prisma } from '@/lib/db/prisma';
import { calendarDateInTimeZone, todoListTimeZone } from '@/lib/todo/timezone';

const PEEK_DAYS = 7;
const PEEK_TIMEOUT_MS = 6000;

export type WorkCalendarDay = {
  ymd: string;
  weekday: string;
  day: number;
  items: CalendarOverlayItem[];
};

export type WorkCalendarGoogle =
  | { status: 'ok'; mailboxEmail: string; mailboxes: CalendarMailbox[] }
  | { status: 'no_gmail' }
  | { status: 'timeout' }
  | { status: 'error'; mailboxEmail: string; error: string; needsReconnect: boolean };

export type WorkCalendarPeek = {
  todayYmd: string;
  days: WorkCalendarDay[];
  google: WorkCalendarGoogle;
};

function weekdayShort(ymd: string, timeZone: string): string {
  return new Date(`${ymd}T17:00:00.000Z`).toLocaleDateString('en-US', { timeZone, weekday: 'short' });
}

export async function loadWorkCalendarPeek(opts: {
  sessionEmail: string | null;
  mailbox?: string;
}): Promise<WorkCalendarPeek> {
  const timeZone = todoListTimeZone();
  const todayYmd = calendarDateInTimeZone(new Date(), timeZone);
  const lastYmd = addDaysYmd(todayYmd, PEEK_DAYS - 1);

  const connections = await prisma.gmailConnection.findMany({
    orderBy: { googleEmail: 'asc' },
    select: { id: true, googleEmail: true },
  });
  const mailbox = pickCalendarMailbox(connections, opts.sessionEmail ?? '', opts.mailbox);

  const todosPromise = loadOpenTodoOverlay({
    timeZone,
    todayYmd,
    startYmd: todayYmd,
    endYmd: lastYmd,
  });

  let google: WorkCalendarGoogle;
  let eventItems: CalendarOverlayItem[] = [];

  if (!mailbox) {
    google = { status: 'no_gmail' };
  } else {
    const load = loadGoogleCalendarMonth({
      connectionId: mailbox.id,
      mailboxEmail: mailbox.googleEmail,
      timeMinIso: `${todayYmd}T00:00:00-12:00`,
      timeMaxIso: `${addDaysYmd(lastYmd, 1)}T00:00:00+14:00`,
      timeZone,
      maxCalendars: 4,
      maxEventsPerCalendar: 40,
    });
    const loaded = await Promise.race([
      load,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PEEK_TIMEOUT_MS)),
    ]);
    if (!loaded) {
      google = { status: 'timeout' };
    } else if (!loaded.ok) {
      google = {
        status: 'error',
        mailboxEmail: mailbox.googleEmail,
        error: loaded.error,
        needsReconnect: loaded.needsReconnect,
      };
    } else {
      google = { status: 'ok', mailboxEmail: mailbox.googleEmail, mailboxes: connections };
      eventItems = loaded.events.map(overlayFromGoogleEvent);
    }
  }

  const todos = await todosPromise;
  const byDay = groupOverlayByDay(mergeOverlayItems(eventItems, todos));
  const days: WorkCalendarDay[] = [];
  for (let i = 0; i < PEEK_DAYS; i += 1) {
    const ymd = addDaysYmd(todayYmd, i);
    days.push({
      ymd,
      weekday: weekdayShort(ymd, timeZone),
      day: Number(ymd.slice(8, 10)),
      items: byDay.get(ymd) ?? [],
    });
  }

  return { todayYmd, days, google };
}
