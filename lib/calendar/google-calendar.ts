import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { addDaysYmd } from '@/lib/calendar/month-grid';
import { googleApiFirstReason, googleApiStatus } from '@/lib/gmail/google-api-error';
import { getGmailOAuth2ClientForConnection } from '@/lib/gmail/tokens-db';
import { calendarDateInTimeZone, todoListTimeZone } from '@/lib/todo/timezone';

export const GOOGLE_CALENDAR_API_LIBRARY =
  'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com';

const MAX_CALENDARS = 8;
const MAX_EVENTS_PER_CALENDAR = 120;

export type GoogleCalendarEventItem = {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  ymd: string;
  allDay: boolean;
  startLabel: string;
  htmlLink: string | null;
};

export type GoogleCalendarLoadResult =
  | {
      ok: true;
      mailboxEmail: string;
      timeZone: string;
      calendars: { id: string; summary: string }[];
      events: GoogleCalendarEventItem[];
    }
  | { ok: false; error: string; needsReconnect: boolean; mailboxEmail: string };

function isScopeOrApiError(err: unknown): { needsReconnect: boolean; message: string } {
  const status = googleApiStatus(err);
  const reason = googleApiFirstReason(err) ?? '';
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(
      `${reason} ${msg}`,
    )
  ) {
    return {
      needsReconnect: true,
      message: 'This mailbox has not granted Calendar yet. Reconnect Gmail in Settings (includes Google Calendar).',
    };
  }
  if (status === 403 && /accessNotConfigured|not been used in project|has not been used/i.test(msg)) {
    return {
      needsReconnect: false,
      message:
        'Enable Google Calendar API on the same Cloud project as Gmail (APIs & Services → Library → Google Calendar API), then reload.',
    };
  }
  if (status === 403) {
    return {
      needsReconnect: true,
      message: 'Calendar returned forbidden. Reconnect Gmail in Settings and allow Google Calendar when Google asks.',
    };
  }
  return { needsReconnect: false, message: msg.length > 220 ? `${msg.slice(0, 220)}…` : msg };
}

function ymdRangeExclusive(startYmd: string, endYmdExclusive: string): string[] {
  const out: string[] = [];
  let cur = startYmd;
  let guard = 0;
  while (cur < endYmdExclusive && guard < 40) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
    guard += 1;
  }
  return out;
}

function formatTimeLabel(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function eventsFromGoogleItem(
  item: calendar_v3.Schema$Event,
  calendarId: string,
  calendarName: string,
  timeZone: string,
): GoogleCalendarEventItem[] {
  const id = item.id ?? `${calendarId}-${item.etag ?? item.htmlLink ?? Math.random()}`;
  const title = (item.summary ?? '(No title)').trim() || '(No title)';
  const htmlLink = item.htmlLink ?? null;
  const start = item.start;
  const end = item.end;
  if (!start) return [];

  if (start.date) {
    const startYmd = start.date;
    const endExclusive = end?.date && end.date > startYmd ? end.date : addDaysYmd(startYmd, 1);
    return ymdRangeExclusive(startYmd, endExclusive).map((ymd, i) => ({
      id: `${id}:${ymd}:${i}`,
      calendarId,
      calendarName,
      title,
      ymd,
      allDay: true,
      startLabel: 'All day',
      htmlLink,
    }));
  }

  if (!start.dateTime) return [];
  const ymd = calendarDateInTimeZone(new Date(start.dateTime), timeZone);
  return [
    {
      id,
      calendarId,
      calendarName,
      title,
      ymd,
      allDay: false,
      startLabel: formatTimeLabel(start.dateTime, timeZone),
      htmlLink,
    },
  ];
}

export async function probeGoogleCalendarAccess(connectionId: string): Promise<{
  ok: boolean;
  error?: string;
  needsReconnect?: boolean;
}> {
  try {
    const auth = await getGmailOAuth2ClientForConnection(connectionId);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.calendarList.list({ maxResults: 1, minAccessRole: 'reader' });
    return { ok: true };
  } catch (e) {
    const { needsReconnect, message } = isScopeOrApiError(e);
    return { ok: false, error: message, needsReconnect };
  }
}

export async function loadGoogleCalendarMonth(params: {
  connectionId: string;
  mailboxEmail: string;
  timeMinIso: string;
  timeMaxIso: string;
  timeZone?: string;
}): Promise<GoogleCalendarLoadResult> {
  const timeZone = params.timeZone ?? todoListTimeZone();
  try {
    const auth = await getGmailOAuth2ClientForConnection(params.connectionId);
    const calendar = google.calendar({ version: 'v3', auth });
    const listRes = await calendar.calendarList.list({
      minAccessRole: 'reader',
      maxResults: 50,
    });
    const listed = (listRes.data.items ?? []).filter((c): c is calendar_v3.Schema$CalendarListEntry & { id: string } =>
      Boolean(c.id),
    );
    const preferred = listed.filter((c) => c.selected !== false).slice(0, MAX_CALENDARS);
    const calendars = (preferred.length > 0 ? preferred : listed.slice(0, 1)).map((c) => ({
      id: c.id,
      summary: (c.summary ?? c.id).trim() || c.id,
    }));

    const chunks = await Promise.all(
      calendars.map(async (cal) => {
        try {
          const ev = await calendar.events.list({
            calendarId: cal.id,
            timeMin: params.timeMinIso,
            timeMax: params.timeMaxIso,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: MAX_EVENTS_PER_CALENDAR,
            timeZone,
          });
          return (ev.data.items ?? []).flatMap((item) => eventsFromGoogleItem(item, cal.id, cal.summary, timeZone));
        } catch (e) {
          console.error('[calendar] events.list', cal.id, e);
          return [] as GoogleCalendarEventItem[];
        }
      }),
    );

    const events = chunks.flat().sort((a, b) => {
      if (a.ymd !== b.ymd) return a.ymd.localeCompare(b.ymd);
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startLabel.localeCompare(b.startLabel) || a.title.localeCompare(b.title);
    });

    return {
      ok: true,
      mailboxEmail: params.mailboxEmail,
      timeZone,
      calendars,
      events,
    };
  } catch (e) {
    const { needsReconnect, message } = isScopeOrApiError(e);
    return {
      ok: false,
      error: message,
      needsReconnect,
      mailboxEmail: params.mailboxEmail,
    };
  }
}
