import Link from 'next/link';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ job?: string | string[] }>;
};

export default async function ProjectSummaryPage({ searchParams }: PageProps) {
  const raw = (await searchParams).job;
  const jobId = (Array.isArray(raw) ? raw[0] : raw)?.trim() || '';
  const src = jobId
    ? `/project-summary/index.html?job=${encodeURIComponent(jobId)}`
    : '/project-summary/index.html';

  return (
    <div className={`project-summary-page${jobId ? ' project-summary-page-ticket' : ''}`}>
      {jobId ? (
        <div className="project-summary-ticket-bar">
          <Link href={`/dashboard/jobs/${jobId}`} className="btn btn-sm btn-outline-secondary">
            ← Ticket
          </Link>
          <span className="small text-body-secondary">Saving to this ticket’s job folder as Project book.json</span>
        </div>
      ) : null}
      <iframe
        className="project-summary-frame"
        title="Be Seen project book"
        src={src}
        allow="fullscreen"
        allowFullScreen
      />
    </div>
  );
}
