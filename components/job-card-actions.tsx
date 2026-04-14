/** Shared action buttons for job cards and job detail */
export function JobCardActions({ jobId, archived = false }: { jobId: string; archived?: boolean }) {
  if (archived) {
    return (
      <p className="job-card-archived card-archived-note">This ticket is off the board.</p>
    );
  }

  return (
    <div className="actions actions-card">
      <form className="job-card-action job-card-action-start" action={`/api/jobs/${jobId}/start`} method="post">
        <button className="btn" type="submit">
          Start work
        </button>
      </form>
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
      <form className="job-card-action job-card-action-done" action={`/api/jobs/${jobId}/done`} method="post">
        <button className="btn btn-done" type="submit">
          Done
        </button>
      </form>
      <form className="job-card-action job-card-action-lost" action={`/api/jobs/${jobId}/lost`} method="post">
        <button className="btn btn-lost" type="submit">
          Lost
        </button>
      </form>
    </div>
  );
}
