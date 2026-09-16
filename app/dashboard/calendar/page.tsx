import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { GoogleCalendarMonth } from '@/components/google-calendar-month';
import { GmailConnectAnchor } from '@/components/gmail-connect-link';
import {
  loadGoogleCalendarMonth,
  type GoogleCalendarEventItem,
} from '@/lib/calendar/google-calendar';
import {
  addDaysYmd,
  buildMonthGrid,
  formatYearMonth,
  monthTitle,
  parseYearMonthParam,
  shiftYearMonth,
} from '@/lib/calendar/month-grid';
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

  const connections = await prisma.gmailConnection.findMany({
    orderBy: { googleEmail: 'asc' },
    select: { id: true, googleEmail: true },
  });

  if (connections.length === 0) {
    return (
      <div className="board-page">
        <header className="board-topbar">
          <div className="board-topbar-titles">
            <h1 className="board-topbar-title">Calendar</h1>
            <p className="board-topbar-sub">Google Calendar for a connected mailbox.</p>
          </div>
        </header>
        <div className="px-3 px-md-4 py-4">
          <p className="mb-3">Connect Gmail in Settings first. Calendar uses that same Google account.</p>
          <GmailConnectAnchor className="btn btn-primary btn-sm">Connect Gmail</GmailConnectAnchor>
        </div>
      </div>
    );
  }

  const session = await getServerSession(authOptions);
  const sessionEmail = (session?.user?.email ?? '').toLowerCase();
  const requested = (q.mailbox ?? '').trim().toLowerCase();
  const mailbox =
    connections.find((c) => c.googleEmail.toLowerCase() === requested) ??
    connections.find((c) => c.googleEmail.toLowerCase() === sessionEmail) ??
    connections[0]!;

  const gridStart = cells[0]!.ymd;
  const gridEnd = cells[cells.length - 1]!.ymd;
  const timeMinIso = `${gridStart}T00:00:00-12:00`;
  const timeMaxIso = `${addDaysYmd(gridEnd, 1)}T00:00:00+14:00`;

  const loaded = await loadGoogleCalendarMonth({
    connectionId: mailbox.id,
    mailboxEmail: mailbox.googleEmail,
    timeMinIso,
    timeMaxIso,
    timeZone,
  });

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
            Live Google Calendar for the connected mailbox. Enable Calendar API on the Gmail Cloud project, then
            reconnect Gmail so Calendar is on the token.
          </p>
        </div>
        <div className="board-topbar-actions">
          <GmailConnectAnchor className="btn btn-toolbar">Reconnect Gmail</GmailConnectAnchor>
          <a
            className="btn btn-toolbar"
            href="https://calendar.google.com/calendar/u/0/r"
            target="_blank"
            rel="noreferrer"
          >
            Open Google Calendar
          </a>
          <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
            Settings
          </Link>
        </div>
      </header>

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-4" style={{ minHeight: 0 }}>
        {!loaded.ok ? (
          <div className="board-toast board-toast-error mt-3" role="status">
            {loaded.error}{' '}
            {loaded.needsReconnect ? (
              <GmailConnectAnchor className="text-decoration-underline">Reconnect Gmail</GmailConnectAnchor>
            ) : null}
          </div>
        ) : (
          <GoogleCalendarMonth
            year={year}
            month={month}
            monthLabel={monthTitle(year, month, timeZone)}
            prevYm={formatYearMonth(prev.year, prev.month)}
            nextYm={formatYearMonth(next.year, next.month)}
            todayYmd={todayYmd}
            selectedYmd={selectedYmd}
            cells={cells}
            eventsByDay={groupEvents(loaded.events)}
            mailboxes={connections}
            mailboxEmail={mailbox.googleEmail}
            calendars={loaded.calendars}
            timeZone={timeZone}
          />
        )}
      </div>
    </div>
  );
}

function groupEvents(events: GoogleCalendarEventItem[]): Map<string, GoogleCalendarEventItem[]> {
  const map = new Map<string, GoogleCalendarEventItem[]>();
  for (const ev of events) {
    const list = map.get(ev.ymd) ?? [];
    list.push(ev);
    map.set(ev.ymd, list);
  }
  return map;
}
