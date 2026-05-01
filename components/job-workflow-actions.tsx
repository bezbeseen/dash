'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import Modal from 'bootstrap/js/dist/modal';

type Props = {
  jobId: string;
  archived: boolean;
  /** Paid (per sync/live rules) — show wrap-up banner + card hint. */
  needsWrapUpReminder: boolean;
  /** Already saved prod wrap-up notes. */
  wrapUpRecorded: boolean;
};

function hideModal(modalDomId: string) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(modalDomId);
  if (!el) return;
  Modal.getInstance(el)?.hide();
}

export function JobWorkflowActions({
  jobId,
  archived,
  needsWrapUpReminder,
  wrapUpRecorded,
}: Props) {
  const router = useRouter();
  const [startBusy, setStartBusy] = useState(false);
  const [wrapBusy, setWrapBusy] = useState(false);
  const [doneBusy, setDoneBusy] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [wrapError, setWrapError] = useState<string | null>(null);

  const startModalId = `workflow-start-${jobId}`;
  const wrapModalId = `workflow-wrap-${jobId}`;
  const doneModalId = `workflow-done-${jobId}`;

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  if (archived) {
    return <p className="job-card-archived card-archived-note">This ticket is off the board.</p>;
  }

  async function submitStart(form: HTMLFormElement) {
    setStartBusy(true);
    setStartError(null);
    const fd = new FormData(form);
    const labor = fd.get('prodPlanLaborHours')?.toString().trim() ?? '';
    const materials = fd.get('prodPlanMaterials')?.toString() ?? '';
    const comm = fd.get('prodPlanClientCommHours')?.toString().trim() ?? '';
    const design = fd.get('prodPlanDesignHours')?.toString().trim() ?? '';

    const numOrEmpty = (s: string) => {
      if (s === '') return null as number | null;
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    };
    const laborN = numOrEmpty(labor);
    const commN = numOrEmpty(comm);
    const designN = numOrEmpty(design);
    if (laborN === undefined || commN === undefined || designN === undefined) {
      setStartError('Hour fields must be valid numbers.');
      setStartBusy(false);
      return;
    }

    const res = await fetch(`/api/jobs/${jobId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        prodPlanLaborHours: laborN,
        prodPlanMaterials: materials.trim() || null,
        prodPlanClientCommHours: commN,
        prodPlanDesignHours: designN,
      }),
    });

    setStartBusy(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setStartError(
        j?.error === 'blocked'
          ? "That action isn't available for this ticket."
          : 'Could not start production. Check your numbers or try again.',
      );
      return;
    }

    hideModal(startModalId);
    form.reset();
    refresh();
  }

  async function submitWrapNotes(notes: string) {
    setWrapBusy(true);
    setWrapError(null);
    const res = await fetch(`/api/jobs/${jobId}/wrap-up`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ notes }),
    });
    setWrapBusy(false);
    if (!res.ok) {
      setWrapError('Could not save wrap-up.');
      return;
    }
    hideModal(wrapModalId);
    refresh();
  }

  async function submitDone(form: HTMLFormElement) {
    setDoneBusy(true);
    setDoneError(null);
    const fd = new FormData(form);
    const notes = (fd.get('prodWrapUpNotes') as string)?.trim() ?? '';

    const res = await fetch(`/api/jobs/${jobId}/done`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ prodWrapUpNotes: notes || undefined }),
    });

    setDoneBusy(false);
    if (!res.ok) {
      setDoneError('Could not mark done. The ticket may already be off the board.');
      return;
    }
    hideModal(doneModalId);
    window.location.assign('/dashboard/tickets');
  }

  return (
    <>
      {needsWrapUpReminder && !wrapUpRecorded ? (
        <div className="alert alert-secondary small mb-3 d-flex flex-wrap align-items-center gap-2" role="status">
          <span>
            <strong>Paid in full</strong> — log what happened (outcomes, issues, follow-ups) for the team record.
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            data-bs-toggle="modal"
            data-bs-target={`#${wrapModalId}`}
          >
            Log wrap-up
          </button>
        </div>
      ) : null}

      <div className="actions actions-card">
        <button
          type="button"
          className="btn job-card-action job-card-action-start"
          data-bs-toggle="modal"
          data-bs-target={`#${startModalId}`}
        >
          Start work
        </button>
        <form className="job-card-action job-card-action-ready" action={`/api/jobs/${jobId}/ready`} method="post">
          <button className="btn" type="submit">
            Ready
          </button>
        </form>
        <form
          className="job-card-action job-card-action-delivered"
          action={`/api/jobs/${jobId}/delivered`}
          method="post"
        >
          <button className="btn" type="submit" title="Mark delivered or installed on site">
            Delivered / installed
          </button>
        </form>
        {wrapUpRecorded ? (
          <form className="job-card-action job-card-action-done" action={`/api/jobs/${jobId}/done`} method="post">
            <button className="btn btn-done" type="submit">
              Done
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-done job-card-action job-card-action-done"
            data-bs-toggle="modal"
            data-bs-target={`#${doneModalId}`}
          >
            Done
          </button>
        )}
        <form className="job-card-action job-card-action-lost" action={`/api/jobs/${jobId}/lost`} method="post">
          <button className="btn btn-lost" type="submit">
            Lost
          </button>
        </form>
      </div>

      <div
        className="modal fade"
        id={startModalId}
        tabIndex={-1}
        aria-labelledby={`${startModalId}-label`}
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={`${startModalId}-label`}>
                Moving into production
              </h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitStart(e.currentTarget);
              }}
            >
              <div className="modal-body">
                <p className="small text-body-secondary">
                  Optional planning snapshot — everything can be left blank if you prefer to move fast.
                </p>
                {startError ? <p className="text-danger small">{startError}</p> : null}
                <div className="mb-3">
                  <label className="form-label" htmlFor={`${startModalId}-labor`}>
                    Estimated labor (hours)
                  </label>
                  <input
                    className="form-control"
                    id={`${startModalId}-labor`}
                    name="prodPlanLaborHours"
                    type="number"
                    min={0}
                    step="0.25"
                    placeholder="e.g. 12"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor={`${startModalId}-materials`}>
                    Materials (expected / note)
                  </label>
                  <textarea
                    className="form-control"
                    id={`${startModalId}-materials`}
                    name="prodPlanMaterials"
                    rows={2}
                    placeholder="Sheets, hardware, finishes…"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor={`${startModalId}-comm`}>
                    Client communication (hours)
                  </label>
                  <input
                    className="form-control"
                    id={`${startModalId}-comm`}
                    name="prodPlanClientCommHours"
                    type="number"
                    min={0}
                    step="0.25"
                    placeholder="e.g. 2"
                  />
                </div>
                <div className="mb-0">
                  <label className="form-label" htmlFor={`${startModalId}-design`}>
                    Design time (hours)
                  </label>
                  <input
                    className="form-control"
                    id={`${startModalId}-design`}
                    name="prodPlanDesignHours"
                    type="number"
                    min={0}
                    step="0.25"
                    placeholder="e.g. 4"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" data-bs-dismiss="modal">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={startBusy}>
                  {startBusy ? 'Saving…' : 'Start production'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div
        className="modal fade"
        id={wrapModalId}
        tabIndex={-1}
        aria-labelledby={`${wrapModalId}-label`}
        aria-hidden="true"
      >
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={`${wrapModalId}-label`}>
                Production wrap-up
              </h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const notes = (fd.get('notes') as string)?.trim();
                if (notes) void submitWrapNotes(notes);
              }}
            >
              <div className="modal-body">
                <p className="small text-body-secondary mb-2">What happened on this job? (Paid / wrapping up)</p>
                {wrapError ? <p className="text-danger small">{wrapError}</p> : null}
                <textarea
                  className="form-control"
                  name="notes"
                  rows={5}
                  required
                  placeholder="Delivered outcomes, surprises, rework, lessons for next time…"
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" data-bs-dismiss="modal">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={wrapBusy}>
                  {wrapBusy ? 'Saving…' : 'Save wrap-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {!wrapUpRecorded ? (
        <div
          className="modal fade"
          id={doneModalId}
          tabIndex={-1}
          aria-labelledby={`${doneModalId}-label`}
          aria-hidden="true"
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id={`${doneModalId}-label`}>
                  Mark done
                </h5>
                <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitDone(e.currentTarget);
                }}
              >
                <div className="modal-body">
                  <p className="small text-body-secondary mb-2">
                    This removes the ticket from the board. Add a short retrospective so paid/done jobs stay easy to learn
                    from.
                  </p>
                  {doneError ? <p className="text-danger small">{doneError}</p> : null}
                  <textarea
                    className="form-control"
                    name="prodWrapUpNotes"
                    rows={5}
                    required
                    placeholder="What shipped, friction, timeline vs plan, client feedback…"
                  />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" data-bs-dismiss="modal">
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-done" disabled={doneBusy}>
                    {doneBusy ? 'Working…' : 'Mark done'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
