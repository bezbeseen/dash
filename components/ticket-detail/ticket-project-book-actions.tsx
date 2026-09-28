type Props = {
  jobId: string;
  hasFolder: boolean;
};

export function TicketProjectBookActions({ jobId, hasFolder }: Props) {
  return (
    <div className="mb-3">
      <form action={`/api/jobs/${jobId}/project-book`} method="post" className="d-flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary btn-sm">
          Make project book
        </button>
        {hasFolder ? (
          <a className="btn btn-outline-secondary btn-sm" href={`/dashboard/project-summary?job=${jobId}`}>
            Open project book
          </a>
        ) : null}
      </form>
      <p className="small text-body-secondary mt-2 mb-0">
        {hasFolder
          ? 'Writes Project book.json into this job folder (or opens it if it already exists).'
          : 'Creates the job folder from your template if needed, then saves Project book.json there.'}
      </p>
    </div>
  );
}
