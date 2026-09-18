'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { GmailConnectAnchor } from '@/components/gmail-connect-link';

type Mailbox = { id: string; googleEmail: string };

type Props = {
  connections: Mailbox[];
  hasQuickBooks: boolean;
};

function PrequoteFromGmailFields({
  connections,
  defaultMailbox,
  hasMailboxes,
  submitting,
}: {
  connections: Mailbox[];
  defaultMailbox: string;
  hasMailboxes: boolean;
  submitting: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = submitting || formPending;
  const fieldsOff = !hasMailboxes || pending;

  return (
    <>
      <div className={`prequote-from-gmail-fields${pending ? ' is-submitting' : ''}`}>
        <label className="linked-email-field">
          <span>Mailbox</span>
          {hasMailboxes ? (
            <select
              name="gmailConnectionId"
              defaultValue={defaultMailbox}
              required
              aria-disabled={pending || undefined}
              className="gmail-mailbox-select"
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.googleEmail}
                </option>
              ))}
            </select>
          ) : (
            <select className="gmail-mailbox-select" disabled aria-label="Mailbox (connect Gmail first)">
              <option>Connect Gmail in Settings first</option>
            </select>
          )}
        </label>
        <label className="linked-email-field prequote-from-gmail-url">
          <span>Gmail conversation URL or thread ID</span>
          <input
            name="threadUrlOrId"
            type="text"
            required={hasMailboxes}
            disabled={!hasMailboxes}
            readOnly={pending}
            placeholder="https://mail.google.com/mail/…&th=…"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary prequote-from-gmail-submit"
          disabled={fieldsOff}
          aria-busy={pending || undefined}
        >
          {pending ? (
            <>
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              Creating…
            </>
          ) : (
            'Create ticket'
          )}
        </button>
      </div>
      {pending ? (
        <p className="prequote-from-gmail-status" role="status" aria-live="polite">
          Opening the Gmail conversation…
        </p>
      ) : null}
    </>
  );
}

export function PrequoteFromGmailForm({ connections, hasQuickBooks }: Props) {
  const defaultMailbox = connections[0]?.id ?? '';
  const hasMailboxes = connections.length > 0;
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!hasMailboxes || submitLock.current) {
      e.preventDefault();
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
  }

  return (
    <section
      id="prequote-from-gmail"
      className="prequote-from-gmail"
      aria-labelledby="prequote-from-gmail-title"
    >
      <h2 id="prequote-from-gmail-title" className="prequote-from-gmail-title">
        New ticket from Gmail
      </h2>
      <p className="prequote-from-gmail-copy">
        Paste a conversation (Gmail ⋮ → Copy link or the address bar).{' '}
        {hasQuickBooks ? (
          <>
            Dash finds or creates the <strong>QuickBooks customer</strong>, saves a <strong>$0 draft estimate</strong>{' '}
            (not sent — finish amounts in QBO), and opens a ticket with this thread already synced.
          </>
        ) : (
          <>
            QuickBooks is not connected, so this opens a <strong>pre-quote ticket</strong> only.{' '}
            <Link href="/dashboard/settings">Connect QuickBooks</Link> to create the customer and draft estimate too.
          </>
        )}
      </p>
      {!hasMailboxes ? (
        <p className="prequote-from-gmail-hint">
          No Gmail mailbox is connected yet — the form stays here so you can find it.{' '}
          <Link href="/dashboard/settings">Settings</Link>
          {' → '}
          <GmailConnectAnchor className="ticket-mailto">Connect Gmail</GmailConnectAnchor>
          {', then come back and paste a thread.'}
        </p>
      ) : null}
      <form
        className="prequote-from-gmail-form"
        action="/api/jobs/from-gmail-thread"
        method="post"
        onSubmit={onSubmit}
        aria-busy={submitting || undefined}
      >
        <PrequoteFromGmailFields
          connections={connections}
          defaultMailbox={defaultMailbox}
          hasMailboxes={hasMailboxes}
          submitting={submitting}
        />
      </form>
    </section>
  );
}
