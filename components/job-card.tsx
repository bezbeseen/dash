import Link from 'next/link';
import { Job } from '@prisma/client';
import { JobCardActions } from '@/components/job-card-actions';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';
import { jobPrimaryHeading, jobSecondaryHeading } from '@/lib/domain/job-display';
import { fmtDetailDate } from '@/lib/ticket/format';

export function JobCard({ job, extraMeta }: { job: Job; extraMeta?: string }) {
  const sub = jobSecondaryHeading(job);
  return (
    <div className="card">
      <Link href={`/dashboard/jobs/${job.id}`} className="card-main-link">
        <div className="job-card-title">
          <strong>{jobPrimaryHeading(job)}</strong>
        </div>
        {sub ? <div className="job-card-subtitle">{sub}</div> : null}
        <div className="job-card-estimate">
          Estimate: ${(job.estimateAmountCents / 100).toFixed(2)}
        </div>
        <div className="job-card-invoice">
          Invoice paid: ${(job.amountPaidCents / 100).toFixed(2)} / $
          {(job.invoiceAmountCents / 100).toFixed(2)}
        </div>
        <div className="job-card-quickbooks">
          QuickBooks date: {job.qbOrderingAt ? fmtDetailDate(job.qbOrderingAt) : 'n/a'}; Dash created{' '}
          {fmtDetailDate(job.createdAt)}
        </div>
        <div className="job-card-updated">Updated {fmtDetailDate(job.updatedAt)}</div>
        {extraMeta ? <div className="job-card-extra card-extra-meta">{extraMeta}</div> : null}
        <div className="job-card-status badge">{boardStatusDisplayLabel(job.boardStatus)}</div>
        <span className="job-card-open-hint card-open-hint">Open ticket →</span>
      </Link>
      <JobCardActions jobId={job.id} archived={job.archivedAt != null} />
    </div>
  );
}
