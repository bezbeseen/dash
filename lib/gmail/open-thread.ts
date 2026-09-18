import { google, gmail_v1 } from 'googleapis';
import { googleApiFirstReason, googleApiStatus } from '@/lib/gmail/google-api-error';
import {
  collectGmailApiIdCandidates,
  couldNotOpenGmailThreadMessage,
  extractRfc822MsgIdForSearch,
  orderMailboxesForGmailPaste,
  type GmailMailboxRef,
} from '@/lib/gmail/parse-thread-id';
import { getGmailOAuth2ClientForConnection } from '@/lib/gmail/tokens-db';

export { couldNotOpenGmailThreadMessage, gmailBookmarkTicketExplanation } from '@/lib/gmail/parse-thread-id';

export type OpenedGmailThread = {
  data: gmail_v1.Schema$Thread;
  resolvedThreadId: string;
  effectiveUserId: string;
};

function isCouldNotOpenErr(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  return /Could not open that conversation|Couldn't open that conversation/i.test(msg);
}

function isRetryableThreadLookupErr(err: unknown): boolean {
  const status = googleApiStatus(err);
  const reason = googleApiFirstReason(err);
  const msg = err instanceof Error ? err.message : '';
  return (
    status === 400 ||
    status === 404 ||
    reason === 'invalidArgument' ||
    reason === 'notFound' ||
    /invalid id/i.test(msg) ||
    /invalid.*id value/i.test(msg) ||
    /not found/i.test(msg)
  );
}

/**
 * threads.get only accepts a thread id; Gmail UI sometimes exposes a message id.
 * Try both mailbox email and `me` as userId — behavior differs by workspace / consumer account.
 */
async function getThreadFullSafe(
  gmail: gmail_v1.Gmail,
  mailboxEmail: string | null,
  idFromUser: string,
): Promise<OpenedGmailThread> {
  const userIds = mailboxEmail && mailboxEmail !== 'me' ? [mailboxEmail, 'me'] : ['me'];
  let lastErr: unknown = null;

  for (const userId of userIds) {
    try {
      const res = await gmail.users.threads.get({
        userId,
        id: idFromUser,
        format: 'full',
      });
      return { data: res.data, resolvedThreadId: idFromUser, effectiveUserId: userId };
    } catch (e) {
      lastErr = e;
      if (!isRetryableThreadLookupErr(e)) throw e;
    }
  }

  for (const userId of userIds) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId,
        id: idFromUser,
        format: 'minimal',
      });
      const tid = msgRes.data.threadId;
      if (!tid) continue;
      const res = await gmail.users.threads.get({
        userId,
        id: tid,
        format: 'full',
      });
      return { data: res.data, resolvedThreadId: tid, effectiveUserId: userId };
    } catch (e) {
      lastErr = e;
      if (!isRetryableThreadLookupErr(e)) throw e;
    }
  }

  console.info('[gmail/sync] thread lookup failed after retries', {
    idSample: idFromUser.slice(0, 24),
    mailboxEmail,
    lastStatus: googleApiStatus(lastErr),
  });
  throw new Error(couldNotOpenGmailThreadMessage(mailboxEmail ? [mailboxEmail] : []));
}

/** Fallback: Gmail search by RFC822 Message-ID finds the API thread even when the web hash id is wrong. */
async function findThreadViaRfc822MsgId(
  gmail: gmail_v1.Gmail,
  mailboxEmail: string | null,
  storedRaw: string,
): Promise<OpenedGmailThread | null> {
  const msgId = extractRfc822MsgIdForSearch(storedRaw);
  if (!msgId) return null;

  const userIds = mailboxEmail && mailboxEmail !== 'me' ? [mailboxEmail, 'me'] : ['me'];
  const bracketed = msgId.startsWith('<') && msgId.endsWith('>') ? msgId : `<${msgId}>`;
  const unbracketed = bracketed.slice(1, -1);

  const candidateQueries = [
    `rfc822msgid:${bracketed}`,
    `rfc822msgid:"${bracketed}"`,
    `rfc822msgid:${unbracketed}`,
    `rfc822msgid:"<${unbracketed}>"`,
  ];

  for (const q of candidateQueries) {
    for (const userId of userIds) {
      try {
        const list = await gmail.users.messages.list({ userId, q, maxResults: 10 });
        const hits = list.data.messages ?? [];
        for (const hit of hits) {
          if (!hit.id) continue;
          let tid: string | undefined | null = hit.threadId;
          if (!tid) {
            try {
              const one = await gmail.users.messages.get({ userId, id: hit.id, format: 'minimal' });
              tid = one.data.threadId;
            } catch {
              continue;
            }
          }
          if (!tid) continue;
          const res = await gmail.users.threads.get({ userId, id: tid, format: 'full' });
          return { data: res.data, resolvedThreadId: tid, effectiveUserId: userId };
        }
      } catch (e) {
        console.info('[gmail/sync] rfc822msgid list failed', {
          userId,
          mailboxEmail,
          status: googleApiStatus(e),
        });
      }
    }
  }
  return null;
}

async function openWithClient(opts: {
  gmail: gmail_v1.Gmail;
  mailboxEmail: string | null;
  storedRaw: string;
}): Promise<OpenedGmailThread> {
  const ids = collectGmailApiIdCandidates(opts.storedRaw);
  let lastErr: unknown = null;

  for (const idForApi of ids) {
    try {
      return await getThreadFullSafe(opts.gmail, opts.mailboxEmail, idForApi);
    } catch (e) {
      lastErr = e;
      if (!isRetryableThreadLookupErr(e) && !isCouldNotOpenErr(e)) {
        throw e;
      }
    }
  }

  const via = await findThreadViaRfc822MsgId(opts.gmail, opts.mailboxEmail, opts.storedRaw);
  if (via) return via;

  if (isCouldNotOpenErr(lastErr)) throw lastErr;
  throw new Error(couldNotOpenGmailThreadMessage(opts.mailboxEmail ? [opts.mailboxEmail] : []));
}

/** Resolve a pasted Gmail URL / thread id / Message-ID into a full thread (one mailbox). */
export async function openGmailThread(opts: {
  gmail: gmail_v1.Gmail;
  mailboxEmail: string | null;
  storedRaw: string;
}): Promise<OpenedGmailThread> {
  return openWithClient(opts);
}

export type OpenGmailThreadAcrossResult =
  | { ok: true; opened: OpenedGmailThread; mailbox: GmailMailboxRef }
  | { ok: false; triedEmails: string[] };

/** Try the preferred mailbox, then every other connected mailbox, until one can open the thread. */
export async function openGmailThreadAcrossMailboxes(opts: {
  storedRaw: string;
  preferredConnectionId: string;
  mailboxes: GmailMailboxRef[];
  createdOrder?: GmailMailboxRef[];
}): Promise<OpenGmailThreadAcrossResult> {
  const ordered = orderMailboxesForGmailPaste(opts.mailboxes, {
    preferredId: opts.preferredConnectionId,
    pasted: opts.storedRaw,
    createdOrder: opts.createdOrder,
  });
  const triedEmails: string[] = [];

  for (const mailbox of ordered) {
    triedEmails.push(mailbox.googleEmail);
    try {
      const auth = await getGmailOAuth2ClientForConnection(mailbox.id);
      const gmail = google.gmail({ version: 'v1', auth });
      const opened = await openWithClient({
        gmail,
        mailboxEmail: mailbox.googleEmail,
        storedRaw: opts.storedRaw,
      });
      return { ok: true, opened, mailbox };
    } catch (e) {
      console.info('[gmail/open] mailbox could not open thread', {
        mailbox: mailbox.googleEmail,
        status: googleApiStatus(e),
        message: e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160),
      });
    }
  }

  return { ok: false, triedEmails };
}
