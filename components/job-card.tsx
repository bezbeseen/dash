import Link from 'next/link';
import { Job } from '@prisma/client';
import { JobCardActions } from '@/components/job-card-actions';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';

export function JobCard({ job, extraMeta }: { job: Job; extraMeta?: string }) {
  return (
    <div className="card">
      <Link href={`/dashboard/jobs/${job.id}`} className="card-main-link">
        <div>
          <strong>{job.projectName}</strong>
        </div>
        <div>{job.customerName}</div>
        <div className="meta">Estimate: ${(job.estimateAmountCents / 100).toFixed(2)}</div>
        <div className="meta">
          Invoice paid: ${(job.amountPaidCents / 100).toFixed(2)} / $
          {(job.invoiceAmountCents / 100).toFixed(2)}
        </div>
        {extraMeta ? <div className="meta card-extra-meta">{extraMeta}</div> : null}
        <div className="badge">{boardStatusDisplayLabel(job.boardStatus)}</div>
        <span className="card-open-hint meta">Open ticket →</span>
      </Link>
      <JobCardActions jobId={job.id} archived={job.archivedAt != null} />
    </div>
  );
}
