import fs from 'fs/promises';
import path from 'path';
import { google, gmail_v1 } from 'googleapis';
import { prisma } from '@/lib/db/prisma';
import { googleApiFirstReason, googleApiStatus } from '@/lib/gmail/google-api-error';
import {
  extractRfc822MsgIdForSearch,
  resolveGmailThreadInputForApi,
} from '@/lib/gmail/parse-thread-id';
import { getGmailOAuth2ClientForApi, getGmailOAuth2ClientForConnection } from '@/lib/gmail/tokens-db';

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
): Promise<{ data: gmail_v1.Schema$Thread; resolvedThreadId: string; effectiveUserId: string }> {
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

  const hint = mailboxEmail != null ? ` (${mailboxEmail} + “me” both failed).` : '';
  console.error('[gmail/sync] thread lookup failed after retries', {
    idSample: idFromUser.slice(0, 24),
    lastErr,
  });
  throw new Error(
    'Gmail API cannot open this conversation' +
      hint +
      ' Paste ⋮ → “Copy link” (&th=), or open ⋮ → “Show original” and copy the Message-ID line into this field, or forward the latest message to yourself and sync the new thread. With multiple Google accounts, /u/0 in the URL must match the account you used for Connect Gmail.',
  );
}

/** Fallback: Gmail search by RFC822 Message-ID finds the API thread even when the web hash id is wrong. */
async function findThreadViaRfc822MsgId(
  gmail: gmail_v1.Gmail,
  mailboxEmail: string | null,
  storedRaw: string,
): Promise<{ data: gmail_v1.Schema$Thread; resolvedThreadId: string; effectiveUserId: string } | null> {
  const msgId = extractRfc822MsgIdForSearch(storedRaw);
  console.info('[gmail/sync] rfc822msgid extract', {
    storedRawSample: storedRaw.slice(0, 60),
    storedRawTailSample: storedRaw.slice(-60),
    extractedMsgId: msgId,
    mailboxEmail,
  });
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

  console.info('[gmail/sync] rfc822msgid search candidates', {
    msgId,
    bracketed,
    unbracketed,
    userIds,
    candidateQueries,
  });

  for (const q of candidateQueries) {
    for (const userId of userIds) {
      try {
        const list = await gmail.users.messages.list({ userId, q, maxResults: 10 });
        const hits = list.data.messages ?? [];
        console.info('[gmail/sync] rfc822msgid hits', { userId, q, hitCount: hits.length });
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
        console.error('[gmail/sync] rfc822msgid list failed', { userId, q, e });
      }
    }
  }
  return null;
}

function headerGet(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string | undefined {
  const h = headers?.find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
  return h?.value ?? undefined;
}

function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined | null,
  out: { filename: string; attachmentId: string; mimeType?: string | null; size: number }[],
): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    out.push({
      filename: part.filename,
      attachmentId: part.body.attachmentId,
      mimeType: part.mimeType,
      size: part.body.size ?? 0,
    });
  }
  for (const p of part.parts || []) {
    walkParts(p, out);
  }
}

export async function syncGmailThreadForJob(jobId: string): Promise<{ messages: number; files: number }> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const stored = job.gmailThreadId?.trim();
  if (!stored) {
    throw new Error('Save a Gmail thread ID or inbox URL on this ticket before syncing.');
  }

  const idForApi = resolveGmailThreadInputForApi(stored);

  const connId = job.gmailConnectionId;
  const auth = connId
    ? await getGmailOAuth2ClientForConnection(connId)
    : await getGmailOAuth2ClientForApi();

  let mailboxEmail: string | null = null;
  if (connId) {
    const connRow = await prisma.gmailConnection.findUnique({ where: { id: connId } });
    if (connRow?.googleEmail) mailboxEmail = connRow.googleEmail;
  }

  const gmail = google.gmail({ version: 'v1', auth });

  let threadPkg: {
    data: gmail_v1.Schema$Thread;
    resolvedThreadId: string;
    effectiveUserId: string;
  };
  try {
    threadPkg = await getThreadFullSafe(gmail, mailboxEmail, idForApi);
  } catch (firstErr) {
    console.error('[gmail/sync] first lookup failed; attempting rfc822msgid fallback', {
      firstErr,
      storedSample: stored?.slice(0, 60),
    });
    const via = await findThreadViaRfc822MsgId(gmail, mailboxEmail, stored);
    if (via) {
      console.info('[gmail/sync] resolved thread via rfc822msgid search');
      threadPkg = via;
    } else {
      throw firstErr;
    }
  }

  const { data: threadData, resolvedThreadId, effectiveUserId: gmailUserId } = threadPkg;

  const storedLooksLikeBookmark =
    /^https?:\/\//i.test(stored) || stored.includes('#') || /[?&]th=/i.test(stored);
  if (!storedLooksLikeBookmark && resolvedThreadId !== stored) {
    await prisma.job.update({
      where: { id: jobId },
      data: { gmailThreadId: resolvedThreadId },
    });
  }

  const threadMessages = threadData.messages || [];
  let fileCount = 0;

  const storageDir = path.join(process.cwd(), 'storage', 'gmail-attachments', jobId);
  await fs.mkdir(storageDir, { recursive: true });

  for (const m of threadMessages) {
    if (!m.id) continue;

    const full = await gmail.users.messages.get({
      userId: gmailUserId,
      id: m.id,
      format: 'full',
    });

    const data = full.data;
    const headers = data.payload?.headers;
    const subject = headerGet(headers, 'Subject');
    const from = headerGet(headers, 'From');
    const to = headerGet(headers, 'To');
    const dateHeader = headerGet(headers, 'Date');
    let date: Date | null = null;
    if (dateHeader) {
      const d = new Date(dateHeader);
      if (!Number.isNaN(d.getTime())) date = d;
    }
    const snippet = data.snippet || '';

    const msgRow = await prisma.gmailSyncedMessage.upsert({
      where: {
        jobId_gmailMessageId: { jobId, gmailMessageId: data.id! },
      },
      create: {
        jobId,
        gmailMessageId: data.id!,
        gmailThreadId: data.threadId || resolvedThreadId,
        subject,
        fromAddr: from,
        toAddr: to,
        date,
        snippet,
      },
      update: {
        gmailThreadId: data.threadId || resolvedThreadId,
        subject,
        fromAddr: from,
        toAddr: to,
        date,
        snippet,
      },
    });

    const attList: { filename: string; attachmentId: string; mimeType?: string | null; size: number }[] = [];
    walkParts(data.payload, attList);

    for (const att of attList) {
      const exists = await prisma.gmailSyncedAttachment.findFirst({
        where: {
          messageId: msgRow.id,
          gmailAttachmentId: att.attachmentId,
        },
      });
      if (exists) continue;

      const res = await gmail.users.messages.attachments.get({
        userId: gmailUserId,
        messageId: data.id!,
        id: att.attachmentId,
      });
      const b64 = res.data.data;
      if (!b64) continue;

      const buf = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const safe =
        att.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'attachment';
      const diskName = `${data.id!.slice(-10)}_${att.attachmentId.slice(-10)}_${safe}`;
      const rel = path.join('storage', 'gmail-attachments', jobId, diskName).replace(/\\/g, '/');
      const abs = path.join(process.cwd(), rel);
      await fs.writeFile(abs, buf);

      await prisma.gmailSyncedAttachment.create({
        data: {
          messageId: msgRow.id,
          gmailAttachmentId: att.attachmentId,
          filename: att.filename,
          mimeType: att.mimeType ?? undefined,
          sizeBytes: buf.length,
          storagePath: rel,
        },
      });
      fileCount++;
    }
  }

  return { messages: threadMessages.length, files: fileCount };
}
