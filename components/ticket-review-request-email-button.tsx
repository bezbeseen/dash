'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import Link from 'next/link';

type Props = {
  jobId: string;
  /** When false, the control is hidden (feature off). */
  featureEnabled: boolean;
  /** Gmail OAuth connected for REVIEW_REQUEST_SEND_AS_EMAIL. */
  mailboxReady: boolean;
  /** Last successful send (from server); shown as hint. */
  lastSentAtIso: string | null;
};

export function TicketReviewRequestEmailButton({
  jobId,
  featureEnabled,
  mailboxReady,
  lastSentAtIso,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSend = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/review-request-email`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data: unknown = await res.json().catch(() => null);
      const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      if (!res.ok) {
        const err =
          typeof body.error === 'string' ? body.error : `Request failed (${res.status}).`;
        setError(err);
        return;
      }
      if (body.ok === true && typeof body.to === 'string') {
        setSuccess(`Sent to ${body.to}.`);
        router.refresh();
        return;
      }
      setError(typeof body.error === 'string' ? body.error : 'Could not send.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.');
    } finally {
      setBusy(false);
    }
  }, [jobId, router]);

  if (!featureEnabled) {
    return null;
  }

  const sentHint = lastSentAtIso
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastSentAtIso))
    : null;

  return (
    <div className="ticket-review-email-send mt-3 pt-3 border-top border-secondary-subtle">
      <h3 className="h6 text-body-secondary mb-2">Review request email</h3>
      <p className="small text-body-secondary mb-2">
        Sends the HTML review template to the invoice <strong>Bill email</strong> in QuickBooks (same as the automatic
        send when a ticket is marked Done).
      </p>
      {sentHint ? (
        <p className="small text-body-secondary mb-2">
          Last recorded send: <span className="text-body">{sentHint}</span> (you can send again).
        </p>
      ) : (
        <p className="small text-body-secondary mb-2">No send recorded on this ticket yet.</p>
      )}
      {!mailboxReady ? (
        <p className="small text-warning mb-0">
          Connect the review mailbox in{' '}
          <Link href="/dashboard/settings">Settings → Gmail</Link> (address must match{' '}
          <code className="small">REVIEW_REQUEST_SEND_AS_EMAIL</code>).
        </p>
      ) : (
        <>
          {error ? <p className="text-danger small mb-2">{error}</p> : null}
          {success ? <p className="text-success small mb-2">{success}</p> : null}
          <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => void onSend()}>
            {busy ? 'Sending…' : 'Send review request email'}
          </button>
        </>
      )}
    </div>
  );
}
