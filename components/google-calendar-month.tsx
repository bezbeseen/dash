import Link from 'next/link';
import { GmailConnectAnchor } from '@/components/gmail-connect-link';
import type { GoogleCalendarEventItem } from '@/lib/calendar/google-calendar';
import type { MonthCell } from '@/lib/calendar/month-grid';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CHIP_LIMIT = 3;

type Mailbox = { id: string; googleEmail: string };

type Props = {
  year: number;
  month: number;
  monthLabel: string;
  prevYm: string;
  nextYm: string;
  todayYmd: string;
  selectedYmd: string;
  cells: MonthCell[];
  eventsByDay: Map<string, GoogleCalendarEventItem[]>;
  mailboxes: Mailbox[];
  mailboxEmail: string;
  calendars: { id: string; summary: string }[];
  timeZone: string;
};

function hrefFor(opts: { ym: string; mailbox: string; day?: string }) {
  const u = new URLSearchParams();
  u.set('ym', opts.ym);
  u.set('mailbox', opts.mailbox);
  if (opts.day) u.set('day', opts.day);
  return `/dashboard/calendar?${u.toString()}` as never;
}

export function GoogleCalendarMonth({
  year,
  month,
  monthLabel,
  prevYm,
  nextYm,
  todayYmd,
  selectedYmd,
  cells,
  eventsByDay,
  mailboxes,
  mailboxEmail,
  calendars,
  timeZone,
}: Props) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const selected = eventsByDay.get(selectedYmd) ?? [];
  const selectedLabel = new Date(`${selectedYmd}T17:00:00.000Z`).toLocaleDateString('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="gcal-page-body">
      <div className="gcal-toolbar">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <Link className="btn btn-toolbar btn-sm" href={hrefFor({ ym: prevYm, mailbox: mailboxEmail })}>
            Previous
          </Link>
          <h2 className="h5 fw-semibold mb-0">{monthLabel}</h2>
          <Link className="btn btn-toolbar btn-sm" href={hrefFor({ ym: nextYm, mailbox: mailboxEmail })}>
            Next
          </Link>
          {todayYmd.slice(0, 7) !== ym ? (
            <Link
              className="btn btn-toolbar btn-toolbar-muted btn-sm"
              href={hrefFor({ ym: todayYmd.slice(0, 7), mailbox: mailboxEmail, day: todayYmd })}
            >
              Today
            </Link>
          ) : null}
        </div>
        {mailboxes.length > 1 ? (
          <div className="btn-group" role="group" aria-label="Google account">
            {mailboxes.map((m) => (
              <Link
                key={m.id}
                href={hrefFor({ ym, mailbox: m.googleEmail, day: selectedYmd })}
                className={`btn btn-sm ${
                  m.googleEmail.toLowerCase() === mailboxEmail.toLowerCase()
                    ? 'btn-primary'
                    : 'btn-outline-secondary'
                }`}
              >
                {m.googleEmail}
              </Link>
            ))}
          </div>
        ) : (
          <p className="small text-body-secondary mb-0">{mailboxEmail}</p>
        )}
      </div>

      <p className="small text-body-secondary mb-3">
        Showing calendars this Google account has selected:{' '}
        {calendars.length === 0 ? 'none' : calendars.map((c) => c.summary).join(', ')}.
        {' '}
        <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noreferrer">
          Open Google Calendar
        </a>
        . After a first-time Calendar grant,{' '}
        <GmailConnectAnchor className="text-decoration-underline">reconnect Gmail</GmailConnectAnchor>.
      </p>

      <div className="gcal-layout">
        <div className="gcal-grid" role="grid" aria-label={`${monthLabel} Google Calendar`}>
          {WEEKDAYS.map((d) => (
            <div key={d} className="gcal-dow">
              {d}
            </div>
          ))}
          {cells.map((cell) => {
            const events = eventsByDay.get(cell.ymd) ?? [];
            const extra = Math.max(0, events.length - CHIP_LIMIT);
            const isToday = cell.ymd === todayYmd;
            const isSelected = cell.ymd === selectedYmd;
            return (
              <Link
                key={cell.ymd}
                href={hrefFor({ ym, mailbox: mailboxEmail, day: cell.ymd })}
                className={`gcal-cell${cell.inMonth ? '' : ' is-outside'}${isToday ? ' is-today' : ''}${
                  isSelected ? ' is-selected' : ''
                }`}
              >
                <span className="gcal-cell-num">{cell.day}</span>
                <ul className="gcal-chips">
                  {events.slice(0, CHIP_LIMIT).map((ev) => (
                    <li key={ev.id} className="gcal-chip" title={`${ev.startLabel} · ${ev.title}`}>
                      <span className="gcal-chip-time">{ev.allDay ? 'All day' : ev.startLabel}</span>
                      <span className="gcal-chip-title">{ev.title}</span>
                    </li>
                  ))}
                </ul>
                {extra > 0 ? <span className="gcal-more">+{extra} more</span> : null}
              </Link>
            );
          })}
        </div>

        <aside className="gcal-agenda" aria-label={`Events on ${selectedLabel}`}>
          <h3 className="h6 fw-semibold mb-2">{selectedLabel}</h3>
          {selected.length === 0 ? (
            <p className="small text-body-secondary mb-0">No Google Calendar events this day.</p>
          ) : (
            <ul className="gcal-agenda-list">
              {selected.map((ev) => (
                <li key={ev.id}>
                  <div className="small text-body-secondary">
                    {ev.startLabel}
                    {calendars.length > 1 ? ` · ${ev.calendarName}` : ''}
                  </div>
                  {ev.htmlLink ? (
                    <a href={ev.htmlLink} target="_blank" rel="noreferrer" className="gcal-agenda-title">
                      {ev.title}
                    </a>
                  ) : (
                    <div className="gcal-agenda-title">{ev.title}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
