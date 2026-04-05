import type { GmailConnection, GmailSyncedAttachment, GmailSyncedMessage } from '@prisma/client';
import Link from 'next/link';
import { GmailConnectAnchor } from '@/components/gmail-connect-link';

type Msg = GmailSyncedMessage & { attachments: GmailSyncedAttachment[] };

function fmtDate(d: Date | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  sectionId?: string;
  jobId: string;
  gmailThreadId: string | null;
  gmailConnectionId: string | null;
  connections: Pick<GmailConnection, 'id' | 'googleEmail'>[];
  messages: Msg[];
  /** Total rows in DB (may be &gt; messages.length when UI cap applies). */
  gmailMessageTotalCount: number;
  gmailMessagesUiTruncated: boolean;
  threadError?: boolean;
  mailboxError?: boolean;
  syncError?: string | null;
  syncedOk?: boolean;
};

const MAX_MAILBOXES = 3;

/** Full Gmail thread sync: pick which of your connected mailboxes, then messages + attachments. */
export function TicketGmailSection({
  sectionId,
  jobId,
  gmailThreadId,
  gmailConnectionId,
  connections,
  messages,
  gmailMessageTotalCount,
  gmailMessagesUiTruncated,
  threadError,
  mailboxError,
  syncError,
  syncedOk,
}: Props) {
  const hasMailboxes = connections.length > 0;
  const defaultMailbox = gmailConnectionId ?? connections[0]?.id ?? '';

  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Gmail on this ticket</h2>
      <p className="meta ticket-doc-note">
        You can connect <strong>up to {MAX_MAILBOXES} Gmail accounts</strong> (you, your partner, contact@).
        Paste the <strong>conversation URL</strong> (or id), pick the mailbox, <strong>Save thread</strong>, then{' '}
        <strong>Sync thread</strong> to pull messages and attachments <strong>into Dash</strong> via the Gmail API.
      </p>
      <p className="meta ticket-doc-note" style={{ marginTop: -6 }}>
        <strong>Not the same as &quot;Seed email&quot; below:</strong> seed is only a quick bookmark + note — it{' '}
        <strong>does not</strong> download mail. This section is what syncs real content.
      </p>
      <p className="meta ticket-doc-note" style={{ marginTop: -6 }}>
        <strong>Demo / sandbox QuickBooks tickets are fine:</strong> Gmail still talks to your{' '}
        <strong>real Google mailbox</strong>. You’re only choosing which email thread to attach to this
        ticket row in Dash — the QB customer on the card doesn’t need to match the email participants.
      </p>

      {!hasMailboxes ? (
        <p className="meta" style={{ marginBottom: 12 }}>
          <Link href="/dashboard/settings">Open Settings</Link> and use{' '}
          <GmailConnectAnchor className="ticket-mailto">Connect Gmail</GmailConnectAnchor> — repeat for each account
          (max {MAX_MAILBOXES}).
        </p>
      ) : (
        <p className="meta" style={{ marginBottom: 12 }}>
          <strong>{connections.length}</strong> mailbox
          {connections.length === 1 ? '' : 'es'} connected. Add more from <Link href="/dashboard/settings">Settings</Link>{' '}
          if needed.
        </p>
      )}

      {threadError ? (
        <p className="board-toast board-toast-error" style={{ marginBottom: 12 }}>
          Couldn&apos;t read that as a Gmail thread. Paste a proper Gmail conversation link (address bar or
          ⋮ → Copy link), ideally a URL containing <code>&amp;th=</code> or <code>permmsgid=</code>, or paste a
          Message-ID value from ⋮ → Show original (the <code>&lt;...@...&gt;</code> part).
        </p>
      ) : null}
      {mailboxError ? (
        <p className="board-toast board-toast-error" style={{ marginBottom: 12 }}>
          Choose which mailbox this thread belongs to (you, partner, or contact).
        </p>
      ) : null}
      {syncError ? (
        <p className="board-toast board-toast-error" style={{ marginBottom: 12 }}>
          Sync error: {syncError}
        </p>
      ) : null}
      {syncedOk ? (
        <p className="board-toast board-toast-ok" style={{ marginBottom: 12 }}>
          Gmail thread synced.
        </p>
      ) : null}

      <form className="linked-email-add-form" action={`/api/jobs/${jobId}/gmail-thread`} method="post">
        <label className="linked-email-field linked-email-field-full">
          <span>Mailbox (where this thread lives in Gmail)</span>
          <select
            name="gmailConnectionId"
            defaultValue={defaultMailbox}
            required
            disabled={!hasMailboxes}
            className="gmail-mailbox-select"
          >
            {!defaultMailbox ? <option value="">— Select —</option> : null}
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.googleEmail}
              </option>
            ))}
          </select>
        </label>
        <label className="linked-email-field linked-email-field-full">
          <span>Gmail conversation URL or thread id</span>
          <input
            name="threadUrlOrId"
            type="text"
            defaultValue={gmailThreadId ?? ''}
            placeholder="Gmail URL (&th= or permmsgid=), ⋮ → Copy link, or Message-ID from ⋮ → Show original"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="btn btn-toolbar" disabled={!hasMailboxes}>
          Save thread on ticket
        </button>
      </form>

      <form className="linked-email-add-form" style={{ marginTop: 16 }} action={`/api/jobs/${jobId}/gmail-sync`} method="post">
        <button
          type="submit"
          className="btn btn-toolbar"
          disabled={!hasMailboxes || !gmailThreadId || !gmailConnectionId}
          title={
            !gmailThreadId
              ? 'Save a thread first'
              : !gmailConnectionId
                ? 'Save thread with a mailbox selected'
                : 'Download all messages & attachments'
          }
        >
          Sync thread from Gmail
        </button>
      </form>
      {hasMailboxes && gmailThreadId && !gmailConnectionId ? (
        <p className="meta gmail-sync-hint" style={{ marginTop: 10 }}>
          <strong>Sync is waiting:</strong> this ticket has a saved thread but no mailbox on file. Choose a
          mailbox above and click <strong>Save thread on ticket</strong> again (older tickets need this once).
        </p>
      ) : null}
      {hasMailboxes && !gmailThreadId ? (
        <p className="meta gmail-sync-hint" style={{ marginTop: 10 }}>
          Paste a Gmail conversation URL, save, then sync — the button stays off until a thread is saved.
        </p>
      ) : null}

      {messages.length > 0 ? (
        <div className="gmail-synced-thread" style={{ marginTop: 24 }}>
          <h3 className="detail-section-title" style={{ marginBottom: 12 }}>
            Synced messages ({gmailMessageTotalCount}
            {gmailMessagesUiTruncated ? ` · showing latest ${messages.length}` : ''})
          </h3>
          {gmailMessagesUiTruncated ? (
            <p className="meta gmail-ui-cap-notice" style={{ marginBottom: 14 }}>
              This thread has <strong>{gmailMessageTotalCount}</strong> messages in Dash. Only the{' '}
              <strong>latest {messages.length}</strong> are shown here so the page doesn&apos;t overload the
              browser. Full content stays in the database; open Gmail for the complete archive if needed.
            </p>
          ) : null}
          <ul className="gmail-message-list">
            {messages.map((m) => (
              <li key={m.id} className="gmail-message-card">
                <div className="gmail-message-head">
                  <strong>{m.subject || '(no subject)'}</strong>
                  <span className="meta">{fmtDate(m.date)}</span>
                </div>
                <div className="gmail-message-meta meta">
                  {m.fromAddr ? <span>From: {m.fromAddr}</span> : null}
                  {m.toAddr ? <span>To: {m.toAddr}</span> : null}
                </div>
                {m.snippet ? <p className="gmail-snippet">{m.snippet}</p> : null}
                {m.attachments.length > 0 ? (
                  <ul className="gmail-attachment-list">
                    {m.attachments.map((a) => (
                      <li key={a.id}>
                        <a
                          href={`/api/jobs/${jobId}/gmail-files/${a.id}`}
                          className="ticket-mailto"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {a.filename}
                        </a>
                        <span className="meta"> · {fmtSize(a.sizeBytes)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : gmailThreadId ? (
        <p className="meta" style={{ marginTop: 16 }}>
          Thread saved — run <strong>Sync thread from Gmail</strong> to load messages and files.
        </p>
      ) : null}
    </section>
  );
}
