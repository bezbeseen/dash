'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { GmailConnectAnchor } from '@/components/gmail-connect-link';
import { takeVisibleOverlay } from '@/lib/calendar/overlay';
import type { WorkCalendarPeek as WorkCalendarPeekData } from '@/lib/calendar/work-peek';

const CHIP_LIMIT = 5;

type Props = {
  peek: WorkCalendarPeekData;
  selectedYmd?: string;
  defaultOpen?: boolean;
};

function monthHref(mailboxEmail: string | undefined, ymd: string) {
  const u = new URLSearchParams();
  u.set('ym', ymd.slice(0, 7));
  u.set('day', ymd);
  if (mailboxEmail) u.set('mailbox', mailboxEmail);
  return `/dashboard/calendar?${u.toString()}` as never;
}

function workHref(mailboxEmail: string, ymd?: string) {
  const u = new URLSearchParams();
  u.set('mailbox', mailboxEmail);
  u.set('cal', '1');
  if (ymd) u.set('day', ymd);
  return `/dashboard/work?${u.toString()}` as never;
}

function mailboxEmailOf(peek: WorkCalendarPeekData): string | undefined {
  if (peek.google.status === 'ok' || peek.google.status === 'error') return peek.google.mailboxEmail;
  return undefined;
}

export function WorkCalendarPeek({ peek, selectedYmd, defaultOpen = false }: Props) {
  const mailboxEmail = mailboxEmailOf(peek);
  const highlight = selectedYmd && peek.days.some((d) => d.ymd === selectedYmd) ? selectedYmd : peek.todayYmd;
  const g = peek.google;
  const days = peek.days.filter((d) => d.ymd === peek.todayYmd || d.items.length > 0);
  const todayCount = peek.days.find((d) => d.ymd === peek.todayYmd)?.items.length ?? 0;
  const todayOverdue = peek.days.some((d) => d.ymd === peek.todayYmd && d.items.some((item) => item.overdue));

  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="work-cal-drop" ref={rootRef}>
      <button
        type="button"
        className={`btn btn-toolbar work-cal-drop-btn${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <i className="material-icons-outlined" aria-hidden>
          calendar_month
        </i>
        Calendar
        {todayCount > 0 ? (
          <span className={`work-cal-drop-count${todayOverdue ? ' is-overdue' : ''}`}>{todayCount}</span>
        ) : null}
        <i className="material-icons-outlined" aria-hidden>
          {open ? 'expand_less' : 'expand_more'}
        </i>
      </button>

      {open ? (
        <div className="work-cal-drop-menu card border rounded-3 bg-body shadow" id={menuId} role="dialog" aria-label="This week">
          <div className="work-cal-drop-head">
            <div className="min-w-0">
              <p className="work-cal-drop-kicker mb-0">This week</p>
              {g.status === 'ok' ? (
                <p className="small text-body-secondary mb-0 text-truncate">{g.mailboxEmail.split('@')[0]}</p>
              ) : null}
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Link href={monthHref(mailboxEmail, highlight)} className="btn btn-sm btn-outline-secondary">
                Month
              </Link>
              {g.status === 'no_gmail' ? (
                <GmailConnectAnchor className="btn btn-sm btn-outline-secondary">Connect</GmailConnectAnchor>
              ) : g.status === 'error' && g.needsReconnect ? (
                <GmailConnectAnchor className="btn btn-sm btn-outline-secondary">Reconnect</GmailConnectAnchor>
              ) : (
                <a
                  className="btn btn-sm btn-outline-secondary"
                  href="https://calendar.google.com/calendar/u/0/r"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google
                </a>
              )}
            </div>
          </div>

          {g.status === 'ok' && g.mailboxes.length > 1 ? (
            <div className="work-cal-mailboxes px-3 pb-2" role="group" aria-label="Google account">
              {g.mailboxes.map((m) => {
                const active = m.googleEmail.toLowerCase() === g.mailboxEmail.toLowerCase();
                return (
                  <Link
                    key={m.id}
                    href={workHref(m.googleEmail, highlight)}
                    className={`work-cal-mailbox${active ? ' is-active' : ''}`}
                    title={m.googleEmail}
                  >
                    {m.googleEmail.split('@')[0]}
                  </Link>
                );
              })}
            </div>
          ) : null}

          {g.status === 'error' ? (
            <p className="small text-body-secondary px-3 mb-2">{g.error}</p>
          ) : g.status === 'timeout' ? (
            <p className="small text-body-secondary px-3 mb-2">Google Calendar took too long. Shop to-dos still show.</p>
          ) : g.status === 'no_gmail' ? (
            <p className="small text-body-secondary px-3 mb-2">
              To-dos with due dates are here. Connect Gmail to add Google events.
            </p>
          ) : null}

          <div className="work-cal-drop-scroll">
            {days.map((col) => {
              const visible = takeVisibleOverlay(col.items, CHIP_LIMIT);
              const extra = Math.max(0, col.items.length - visible.length);
              const isToday = col.ymd === peek.todayYmd;
              return (
                <div
                  key={col.ymd}
                  className={`work-cal-agenda-day${isToday ? ' is-today' : ''}${col.ymd === highlight ? ' is-selected' : ''}`}
                >
                  <Link href={monthHref(mailboxEmail, col.ymd)} className="work-cal-agenda-label">
                    <span>
                      {col.weekday} {col.day}
                    </span>
                    {isToday ? <span className="work-cal-agenda-today">Today</span> : null}
                  </Link>
                  {col.items.length === 0 ? (
                    <p className="work-cal-empty px-3">Nothing due</p>
                  ) : (
                    <ul className="work-cal-chips">
                      {visible.map((item) => {
                        const className = `work-cal-chip${item.kind === 'todo' ? ' is-todo' : ''}${
                          item.overdue ? ' is-overdue' : ''
                        }`;
                        const inner = (
                          <>
                            <span className="work-cal-chip-time">{item.startLabel}</span>
                            <span className="work-cal-chip-title">{item.title}</span>
                          </>
                        );
                        return (
                          <li key={item.id}>
                            {item.href ? (
                              <a
                                href={item.href}
                                target={item.kind === 'event' ? '_blank' : undefined}
                                rel={item.kind === 'event' ? 'noreferrer' : undefined}
                                className={className}
                                title={item.title}
                              >
                                {inner}
                              </a>
                            ) : (
                              <span className={className} title={item.title}>
                                {inner}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {extra > 0 ? (
                    <Link href={monthHref(mailboxEmail, col.ymd)} className="work-cal-more">
                      +{extra} more
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
