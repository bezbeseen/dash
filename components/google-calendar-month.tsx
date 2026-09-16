import Link from 'next/link';
import { GmailConnectAnchor } from '@/components/gmail-connect-link';
import type { CalendarOverlayItem } from '@/lib/calendar/overlay';
import { takeVisibleOverlay } from '@/lib/calendar/overlay';
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
  itemsByDay: Map<string, CalendarOverlayItem[]>;
  mailboxes: Mailbox[];
  mailboxEmail: string;
  calendars: { id: string; summary: string }[];
  timeZone: string;
  googleHint?: string | null;
  googleNeedsReconnect?: boolean;
};

function hrefFor(opts: { ym: string; mailbox: string; day?: string }) {
  const u = new URLSearchParams();
  u.set('ym', opts.ym);
  if (opts.mailbox) u.set('mailbox', opts.mailbox);
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
  itemsByDay,
  mailboxes,
  mailboxEmail,
  calendars,
  timeZone,
  googleHint,
  googleNeedsReconnect,
}: Props) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const selected = itemsByDay.get(selectedYmd) ?? [];
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
        ) : mailboxEmail ? (
          <p className="small text-body-secondary mb-0">{mailboxEmail}</p>
        ) : null}
      </div>

      <p className="small text-body-secondary mb-3">
        Shop to-dos with due dates sit on this month
        {calendars.length > 0 ? (
          <>
            , plus Google calendars {calendars.map((c) => c.summary).join(', ')}
          </>
        ) : null}
        .{' '}
        <Link href={'/dashboard/todos' as never} className="text-decoration-underline">
          Open to-dos
        </Link>
        {' · '}
        <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noreferrer">
          Open Google Calendar
        </a>
        {googleHint ? (
          <>
            {' · '}
            {googleHint}
            {googleNeedsReconnect ? (
              <>
                {' '}
                <GmailConnectAnchor className="text-decoration-underline">Reconnect Gmail</GmailConnectAnchor>
              </>
            ) : null}
          </>
        ) : null}
      </p>

      <div className="gcal-layout">
        <div className="gcal-grid" role="grid" aria-label={`${monthLabel} calendar`}>
          {WEEKDAYS.map((d) => (
            <div key={d} className="gcal-dow">
              {d}
            </div>
          ))}
          {cells.map((cell) => {
            const items = itemsByDay.get(cell.ymd) ?? [];
            const visible = takeVisibleOverlay(items, CHIP_LIMIT);
            const extra = Math.max(0, items.length - visible.length);
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
                  {visible.map((item) => (
                    <li
                      key={item.id}
                      className={`gcal-chip${item.kind === 'todo' ? ' is-todo' : ''}${item.overdue ? ' is-overdue' : ''}`}
                      title={`${item.startLabel} · ${item.title}`}
                    >
                      <span className="gcal-chip-time">{item.startLabel}</span>
                      <span className="gcal-chip-title">{item.title}</span>
                    </li>
                  ))}
                </ul>
                {extra > 0 ? <span className="gcal-more">+{extra} more</span> : null}
              </Link>
            );
          })}
        </div>

        <aside className="gcal-agenda" aria-label={`On ${selectedLabel}`}>
          <h3 className="h6 fw-semibold mb-2">{selectedLabel}</h3>
          {selected.length === 0 ? (
            <p className="small text-body-secondary mb-0">No Google events or shop to-dos this day.</p>
          ) : (
            <ul className="gcal-agenda-list">
              {selected.map((item) => (
                <li key={item.id}>
                  <div className={`small${item.overdue ? ' text-danger' : ' text-body-secondary'}`}>
                    {item.startLabel}
                    {item.extra ? ` · ${item.extra}` : ''}
                  </div>
                  {item.href ? (
                    <a
                      href={item.href}
                      target={item.kind === 'event' ? '_blank' : undefined}
                      rel={item.kind === 'event' ? 'noreferrer' : undefined}
                      className={`gcal-agenda-title${item.kind === 'todo' ? ' is-todo' : ''}`}
                    >
                      {item.title}
                    </a>
                  ) : (
                    <div className="gcal-agenda-title">{item.title}</div>
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
