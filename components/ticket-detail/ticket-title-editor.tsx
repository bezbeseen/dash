'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isShopTicketTitle } from '@/lib/domain/job-display';

type Props = {
  jobId: string;
  projectName: string;
  displayTitle: string;
};

export function TicketTitleEditor({ jobId, projectName, displayTitle }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() =>
    isShopTicketTitle(projectName) ? projectName.trim() : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setValue(isShopTicketTitle(projectName) ? projectName.trim() : displayTitle);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
    setBusy(false);
  }

  async function save() {
    const next = value.replace(/\s+/g, ' ').trim();
    if (!next) {
      setError('Enter a title.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ projectName: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setError('Could not save title.');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="ticket-title-editor">
        <h1 className="detail-title">{displayTitle}</h1>
        <button type="button" className="btn btn-sm btn-outline-secondary ticket-title-edit-btn" onClick={startEdit}>
          Edit title
        </button>
      </div>
    );
  }

  return (
    <div className="ticket-title-editor ticket-title-editor-open">
      <label className="visually-hidden" htmlFor={`ticket-title-${jobId}`}>
        Ticket title
      </label>
      <input
        id={`ticket-title-${jobId}`}
        className="form-control ticket-title-editor-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
          if (e.key === 'Escape') cancel();
        }}
        maxLength={512}
        autoFocus
        disabled={busy}
        placeholder={displayTitle}
      />
      <div className="d-flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={cancel} disabled={busy}>
          Cancel
        </button>
      </div>
      {error ? <p className="text-danger small mb-0">{error}</p> : null}
    </div>
  );
}
