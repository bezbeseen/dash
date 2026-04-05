import Link from 'next/link';
import type { Job } from '@prisma/client';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';
import { jobPrimaryHeading, jobSecondaryHeading } from '@/lib/domain/job-display';
import { fmtDetailDate, fmtUsd } from '@/lib/ticket/format';

export function DoneJobRow({ job }: { job: Job }) {
  const sub = jobSecondaryHeading(job);
  const doneAt = job.archivedAt ? fmtDetailDate(job.archivedAt) : '\u2014';
  const createdAt = fmtDetailDate(job.createdAt);

  return (
    <li className="list-group-item px-0 py-0">
      <Link
        href={`/dashboard/jobs/${job.id}`}
        className="d-flex flex-column flex-md-row align-items-start align-items-md-center gap-2 gap-md-3 py-2 px-3 text-body text-decoration-none"
      >
        <div className="flex-grow-1 min-w-0 me-md-auto">
          <div className="fw-semibold text-truncate">{jobPrimaryHeading(job)}</div>
          {sub ? <div className="small text-body-secondary text-truncate">{sub}</div> : null}
          <div className="small text-body-secondary">Created {createdAt}</div>
        </div>
        <div className="small text-body-secondary text-md-end text-nowrap">
          Est {fmtUsd(job.estimateAmountCents)}
          <span className="d-none d-sm-inline">{' \u00b7 '}</span>
          <span className="d-sm-none">
            <br />
          </span>
          Paid {fmtUsd(job.amountPaidCents)} / {fmtUsd(job.invoiceAmountCents)}
        </div>
        <span className="badge bg-primary-subtle text-primary align-self-start align-self-md-center">
          {boardStatusDisplayLabel(job.boardStatus)}
        </span>
        <span className="small text-body-secondary text-md-end text-nowrap">{doneAt}</span>
      </Link>
    </li>
  );
}
