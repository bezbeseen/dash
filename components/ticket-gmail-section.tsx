import type { GmailConnection, GmailLinkSource, GmailSyncedAttachment, GmailSyncedMessage } from '@prisma/client';
import Link from 'next/link';
import { GmailConnectAnchor } from '@/components/gmail-connect-link';
import { describeThreadMatchSignal, type StoredThreadSuggestion } from '@/lib/gmail/thread-match';

type Msg = GmailSyncedMessage & { attachments: GmailSyncedAttachment[] };

const LINK_SOURCE_LABEL: Record<GmailLinkSource, string> = {
  MANUAL: 'pasted by hand',
  CONFIRMED: 'accepted from a suggestion',
  AUTO: 'matched automatically',
};

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
  linkSource?: GmailLinkSource | null;
  linkConfidence?: number | null;
  /** Ranked matches from the last Find email thread run, when nothing was certain enough to attach. */
  suggestions?: StoredThreadSuggestion[];
  matchOk?: string | null;
  matchInfo?: string | null;
  matchError?: string | null;
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
  linkSource,
  linkConfidence,
  suggestions,
  matchOk,
  matchInfo,
  matchError,
}: Props) {
  const hasMailboxes = connections.length > 0;
  const defaultMailbox = gmailConnectionId ?? connections[0]?.id ?? '';
  const ranked = suggestions ?? [];

  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Gmail on this ticket</h2>
      <p className="meta ticket-doc-note">
        Connect up to <strong>{MAX_MAILBOXES} Gmail accounts</strong>. <strong>Find email thread</strong> searches them for
        correspondence with this customer and attaches the thread when there is exactly one clear match; otherwise it lists
        what it found so you can pick. Pasting a conversation URL by hand still works below.
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
      {matchError ? (
        <p className="board-toast board-toast-error" style={{ marginBottom: 12 }}>
          {matchError}
        </p>
      ) : null}
      {matchOk ? (
        <p className="board-toast board-toast-ok" style={{ marginBottom: 12 }}>
          {matchOk}
        </p>
      ) : null}
      {matchInfo ? (
        <p className="board-toast" style={{ marginBottom: 12 }}>
          {matchInfo}
        </p>
      ) : null}

      <div className="gmail-auto-match" style={{ marginBottom: 20 }}>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <form action={`/api/jobs/${jobId}/gmail-find-thread`} method="post">
            <button
              type="submit"
              className="btn btn-toolbar"
              disabled={!hasMailboxes}
              title={
                hasMailboxes
                  ? 'Search the connected mailboxes for this customer and attach the thread if there is only one clear match'
                  : 'Connect a mailbox first'
              }
            >
              Find email thread
            </button>
          </form>
          <a
            className="btn btn-toolbar btn-toolbar-muted"
            href={`/api/jobs/${jobId}/gmail-find-thread`}
            target="_blank"
            rel="noreferrer"
            title="Dry run: shows the searches and the ranking, writes nothing"
          >
            Preview matching
          </a>
          {gmailThreadId ? (
            <form action={`/api/jobs/${jobId}/gmail-unlink`} method="post">
              <button
                type="submit"
                className="btn btn-toolbar btn-toolbar-muted"
                title="Detach the thread and delete the messages synced from it"
              >
                Unlink thread
              </button>
            </form>
          ) : null}
        </div>
        {gmailThreadId && linkSource ? (
          <p className="meta" style={{ marginTop: 10, marginBottom: 0 }}>
            Current link was {LINK_SOURCE_LABEL[linkSource]}
            {linkConfidence != null ? ` (confidence ${linkConfidence}/100)` : ''}. Automatic matching never replaces a link
            you set or confirmed yourself.
          </p>
        ) : null}
      </div>

      {ranked.length > 0 && !gmailThreadId ? (
        <div className="gmail-thread-suggestions" style={{ marginBottom: 20 }}>
          <h3 className="detail-section-title" style={{ marginBottom: 8 }}>
            Possible threads ({ranked.length})
          </h3>
          <p className="meta ticket-doc-note" style={{ marginTop: 0 }}>
            None of these was certain enough to attach on its own. Check the participants before accepting.
          </p>
          <ul className="gmail-message-list">
            {ranked.map((s) => (
              <li key={s.threadId} className="gmail-message-card">
                <div className="gmail-message-head">
                  <strong>{s.subject || '(no subject)'}</strong>
                  <span className="meta">{fmtDate(s.lastMessageAt ? new Date(s.lastMessageAt) : null)}</span>
                </div>
                <div className="gmail-message-meta meta">
                  <span>Mailbox: {s.mailboxEmail}</span>
                  {s.counterparties.length > 0 ? <span>With: {s.counterparties.join(', ')}</span> : null}
                  <span>
                    {s.messageCount} message{s.messageCount === 1 ? '' : 's'} · confidence {s.score}/100
                  </span>
                </div>
                <p className="gmail-snippet">
                  {s.reasons.length > 0
                    ? s.reasons.join(' ')
                    : `Matched on ${s.signals.map(describeThreadMatchSignal).join(', ')}.`}
                </p>
                <form action={`/api/jobs/${jobId}/gmail-find-thread`} method="post">
                  <input type="hidden" name="threadId" value={s.threadId} />
                  <button type="submit" className="btn btn-toolbar">
                    Use this thread
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
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
          <span>Gmail conversation URL or thread ID</span>
          <input
            name="threadUrlOrId"
            type="text"
            defaultValue={gmailThreadId ?? ''}
            placeholder="Paste full Gmail URL (mail.google.com/...&th=...) or thread ID. We auto-extract it."
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
        <p className="meta gmail-sync-hint" style={{ marginTop: 10, color: '#d32f2f' }}>
          <strong>Action needed:</strong> Choose a mailbox above and click <strong>Save thread on ticket</strong> again.
        </p>
      ) : null}
      {hasMailboxes && !gmailThreadId ? (
        <p className="meta gmail-sync-hint" style={{ marginTop: 10 }}>
          Paste a Gmail conversation URL above, click Save, then Sync. The Sync button activates after saving a thread.
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
