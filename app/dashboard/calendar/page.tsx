import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { GoogleCalendarMonth } from '@/components/google-calendar-month';
import { GmailConnectAnchor } from '@/components/gmail-connect-link';
import { loadGoogleCalendarMonth } from '@/lib/calendar/google-calendar';
import {
  addDaysYmd,
  buildMonthGrid,
  formatYearMonth,
  monthTitle,
  parseYearMonthParam,
  shiftYearMonth,
} from '@/lib/calendar/month-grid';
import { pickCalendarMailbox } from '@/lib/calendar/mailbox';
import {
  groupOverlayByDay,
  loadOpenTodoOverlay,
  mergeOverlayItems,
  overlayFromGoogleEvent,
} from '@/lib/calendar/overlay';
import { prisma } from '@/lib/db/prisma';
import { calendarDateInTimeZone, todoListTimeZone } from '@/lib/todo/timezone';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

type PageProps = {
  searchParams: Promise<{ ym?: string; mailbox?: string; day?: string }>;
};

export default async function GoogleCalendarPage({ searchParams }: PageProps) {
  const q = await searchParams;
  const timeZone = todoListTimeZone();
  const todayYmd = calendarDateInTimeZone(new Date(), timeZone);
  const { year, month } = parseYearMonthParam(q.ym, timeZone);
  const ym = formatYearMonth(year, month);
  const prev = shiftYearMonth(year, month, -1);
  const next = shiftYearMonth(year, month, 1);
  const cells = buildMonthGrid(year, month, timeZone);
  const gridStart = cells[0]!.ymd;
  const gridEnd = cells[cells.length - 1]!.ymd;

  const connections = await prisma.gmailConnection.findMany({
    orderBy: { googleEmail: 'asc' },
    select: { id: true, googleEmail: true },
  });

  const session = await getServerSession(authOptions);
  const sessionEmail = (session?.user?.email ?? '').toLowerCase();
  const mailbox = pickCalendarMailbox(connections, sessionEmail, q.mailbox);

  const todosPromise = loadOpenTodoOverlay({
    timeZone,
    todayYmd,
    startYmd: gridStart,
    endYmd: gridEnd,
  });

  let googleHint: string | null = null;
  let googleNeedsReconnect = false;
  let calendars: { id: string; summary: string }[] = [];
  let eventItems: ReturnType<typeof overlayFromGoogleEvent>[] = [];

  if (!mailbox) {
    googleHint = 'Connect Gmail to load Google Calendar events.';
  } else {
    const loaded = await loadGoogleCalendarMonth({
      connectionId: mailbox.id,
      mailboxEmail: mailbox.googleEmail,
      timeMinIso: `${gridStart}T00:00:00-12:00`,
      timeMaxIso: `${addDaysYmd(gridEnd, 1)}T00:00:00+14:00`,
      timeZone,
    });
    if (!loaded.ok) {
      googleHint = loaded.error;
      googleNeedsReconnect = loaded.needsReconnect;
    } else {
      calendars = loaded.calendars;
      eventItems = loaded.events.map(overlayFromGoogleEvent);
    }
  }

  const todos = await todosPromise;
  const itemsByDay = groupOverlayByDay(mergeOverlayItems(eventItems, todos));

  const selectedRaw = q.day?.trim();
  const selectedYmd =
    selectedRaw && /^\d{4}-\d{2}-\d{2}$/.test(selectedRaw)
      ? selectedRaw
      : cells.some((c) => c.ymd === todayYmd)
        ? todayYmd
        : `${ym}-01`;

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Calendar</h1>
          <p className="board-topbar-sub">
            Google Calendar plus shop to-dos with due dates. Overdue to-dos stay on today until they are checked off.
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard/todos" className="btn btn-toolbar">
            To-dos
          </Link>
          {mailbox ? <GmailConnectAnchor className="btn btn-toolbar">Reconnect Gmail</GmailConnectAnchor> : (
            <GmailConnectAnchor className="btn btn-toolbar">Connect Gmail</GmailConnectAnchor>
          )}
          <a
            className="btn btn-toolbar"
            href="https://calendar.google.com/calendar/u/0/r"
            target="_blank"
            rel="noreferrer"
          >
            Open Google Calendar
          </a>
        </div>
      </header>

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-4" style={{ minHeight: 0 }}>
        <GoogleCalendarMonth
          year={year}
          month={month}
          monthLabel={monthTitle(year, month, timeZone)}
          prevYm={formatYearMonth(prev.year, prev.month)}
          nextYm={formatYearMonth(next.year, next.month)}
          todayYmd={todayYmd}
          selectedYmd={selectedYmd}
          cells={cells}
          itemsByDay={itemsByDay}
          mailboxes={connections}
          mailboxEmail={mailbox?.googleEmail ?? ''}
          calendars={calendars}
          timeZone={timeZone}
          googleHint={googleHint}
          googleNeedsReconnect={googleNeedsReconnect}
        />
      </div>
    </div>
  );
}
