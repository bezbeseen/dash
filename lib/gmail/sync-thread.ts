import fs from 'fs/promises';
import path from 'path';
import { google, gmail_v1 } from 'googleapis';
import { prisma } from '@/lib/db/prisma';
import { couldNotOpenGmailThreadMessage, openGmailThreadAcrossMailboxes } from '@/lib/gmail/open-thread';
import { getGmailOAuth2ClientForConnection } from '@/lib/gmail/tokens-db';

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

  const rows = await prisma.gmailConnection.findMany({
    select: { id: true, googleEmail: true, createdAt: true },
  });
  if (rows.length === 0) {
    throw new Error('Gmail is not connected. Use Connect Gmail in Settings.');
  }

  const mailboxes = rows.map(({ id, googleEmail }) => ({ id, googleEmail }));
  const createdOrder = [...rows]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(({ id, googleEmail }) => ({ id, googleEmail }));

  const openedAcross = await openGmailThreadAcrossMailboxes({
    storedRaw: stored,
    preferredConnectionId: job.gmailConnectionId ?? rows[0]!.id,
    mailboxes,
    createdOrder,
  });
  if (!openedAcross.ok) {
    throw new Error(couldNotOpenGmailThreadMessage(openedAcross.triedEmails));
  }

  const mailbox = openedAcross.mailbox;
  if (mailbox.id !== job.gmailConnectionId) {
    await prisma.job.update({
      where: { id: jobId },
      data: { gmailConnectionId: mailbox.id },
    });
  }

  const auth = await getGmailOAuth2ClientForConnection(mailbox.id);
  const gmail = google.gmail({ version: 'v1', auth });
  const threadPkg = openedAcross.opened;

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

  // Use /tmp on Vercel (serverless filesystem is read-only except /tmp)
  const baseDir = process.env.VERCEL === '1' ? '/tmp' : process.cwd();
  const storageDir = path.join(baseDir, 'storage', 'gmail-attachments', jobId);
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
      const baseDir = process.env.VERCEL === '1' ? '/tmp' : process.cwd();
      const abs = path.join(baseDir, rel);
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
