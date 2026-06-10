'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

type Props = {
  jobId: string;
  archived: boolean;
};

export function PrequoteWorkflowActions({ jobId, archived }: Props) {
  const router = useRouter();
  const [quotedBusy, setQuotedBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  if (archived) {
    return <p className="job-card-archived card-archived-note">This ticket is off the board.</p>;
  }

  async function markQuoted() {
    setQuotedBusy(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/move-board`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ column: 'QUOTED' }),
    });
    setQuotedBusy(false);
    if (!res.ok) {
      setError('Could not move to Quoted. Try again or open the ticket.');
      return;
    }
    refresh();
  }

  async function startWork() {
    setStartBusy(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        prodPlanLaborHours: null,
        prodPlanMaterials: null,
        prodPlanClientCommHours: null,
        prodPlanDesignHours: null,
      }),
    });
    setStartBusy(false);
    if (!res.ok) {
      setError('Could not start work. Open the ticket for planning details.');
      return;
    }
    refresh();
  }

  const busy = quotedBusy || startBusy;

  return (
    <div className="prequote-card-actions">
      {error ? <p className="text-danger small mb-2">{error}</p> : null}
      <div className="prequote-card-actions-group">
        <span className="prequote-card-actions-label">Move forward</span>
        <div className="actions actions-card actions-prequote">
          <button
            type="button"
            className="btn job-card-action job-card-action-quoted"
            disabled={busy}
            onClick={() => void markQuoted()}
            title="Quote was sent — move to the main Tickets board"
          >
            {quotedBusy ? 'Moving…' : 'Quote sent → board'}
          </button>
          <button
            type="button"
            className="btn job-card-action job-card-action-start"
            disabled={busy}
            onClick={() => void startWork()}
            title="Skip quote lane and start production"
          >
            {startBusy ? 'Starting…' : 'Start job'}
          </button>
        </div>
      </div>
      <div className="prequote-card-actions-group">
        <span className="prequote-card-actions-label">Remove from pre-quote</span>
        <div className="actions actions-card actions-prequote">
          <form
            className="job-card-action job-card-action-dismiss"
            action={`/api/jobs/${jobId}/dismiss`}
            method="post"
          >
            <button
              className="btn btn-outline-secondary"
              type="submit"
              title="Spam, wrong number, or noise — not a real lost deal"
            >
              Dismiss (junk)
            </button>
          </form>
          <form className="job-card-action job-card-action-lost" action={`/api/jobs/${jobId}/lost`} method="post">
            <button
              className="btn btn-lost"
              type="submit"
              title="Real lead that will not convert"
            >
              Lost (real lead)
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
