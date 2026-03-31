import type { LinkedEmail } from '@prisma/client';

function fmtDate(d: Date | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

type Props = {
  sectionId?: string;
  jobId: string;
  links: LinkedEmail[];
  emailError?: boolean;
};

export function TicketLinkedEmailsSection({ sectionId, jobId, links, emailError }: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Seed email (Gmail)</h2>
      <p className="meta ticket-doc-note">
        <strong>Bookmark only:</strong> paste a Gmail link (and optional subject/from) so the team can open the same
        thread in a click. Nothing here talks to Google — use <strong>Gmail on this ticket</strong> above to sync
        messages into Dash.
      </p>
      {emailError ? (
        <p className="board-toast board-toast-error" style={{ marginBottom: 12 }}>
          Add at least a subject, from, link, or note.
        </p>
      ) : null}

      {links.length > 0 ? (
        <ul className="linked-email-list">
          {links.map((row) => (
            <li key={row.id} className="linked-email-card">
              <div className="linked-email-head">
                <strong className="linked-email-subject">{row.subject || '(no subject)'}</strong>
                <form
                  action={`/api/jobs/${jobId}/linked-emails/${row.id}`}
                  method="post"
                  className="linked-email-remove-form"
                >
                  <button type="submit" className="btn btn-toolbar-muted linked-email-remove">
                    Remove
                  </button>
                </form>
              </div>
              <div className="linked-email-meta">
                {row.fromAddr ? (
                  <span>
                    From <span className="detail-mono">{row.fromAddr}</span>
                  </span>
                ) : null}
                {row.toAddr ? (
                  <span>
                    To <span className="detail-mono">{row.toAddr}</span>
                  </span>
                ) : null}
                {row.sentAt ? <span>Sent {fmtDate(row.sentAt)}</span> : null}
                <span>Added {fmtDate(row.createdAt)}</span>
              </div>
              {row.linkUrl ? (
                <p className="linked-email-link-line">
                  <a href={row.linkUrl} target="_blank" rel="noopener noreferrer" className="ticket-mailto">
                    Open seed in Gmail →
                  </a>
                </p>
              ) : null}
              {row.notes ? <p className="linked-email-notes">{row.notes}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">No seed email linked yet.</p>
      )}

      <form className="linked-email-add-form" action={`/api/jobs/${jobId}/linked-emails`} method="post">
        <div className="linked-email-form-grid">
          <label className="linked-email-field">
            <span>Subject</span>
            <input name="subject" type="text" autoComplete="off" placeholder="Re: Truck wrap quote" />
          </label>
          <label className="linked-email-field">
            <span>From</span>
            <input name="fromAddr" type="email" autoComplete="off" placeholder="customer@…" />
          </label>
          <label className="linked-email-field">
            <span>To (optional)</span>
            <input name="toAddr" type="email" autoComplete="off" placeholder="you@…" />
          </label>
          <label className="linked-email-field">
            <span>Sent at (optional)</span>
            <input name="sentAt" type="datetime-local" />
          </label>
          <label className="linked-email-field linked-email-field-full">
            <span>Gmail URL for the seed</span>
            <input
              name="linkUrl"
              type="url"
              placeholder="https://mail.google.com/mail/u/0/#inbox/…"
            />
          </label>
          <label className="linked-email-field linked-email-field-full">
            <span>Notes (optional)</span>
            <textarea name="notes" rows={2} placeholder="e.g. why this is the seed, job nickname…" />
          </label>
        </div>
        <button type="submit" className="btn btn-toolbar">
          Save seed email
        </button>
      </form>
    </section>
  );
}
