import Link from 'next/link';
import { Job } from '@prisma/client';
import { JobWorkflowActions } from '@/components/job-workflow-actions';
import { jobNeedsWrapUpReminder } from '@/lib/domain/production-workflow';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';
import { jobPrimaryHeading, jobSecondaryHeading } from '@/lib/domain/job-display';
import { isSyntheticQuickBooksId } from '@/lib/quickbooks/invoice-activity';
import { fmtDetailDate } from '@/lib/ticket/format';

type JobCardProps = {
  job: Job;
  /** Ticket-linked tasks: `open` undone, `done` completed. */
  taskCounts?: { open: number; done: number };
  /** True when this ticket was edited in Dash after the last “Sync from QuickBooks” (totals may need a refresh). */
  updatedAfterLastTicketSync?: boolean;
  extraMeta?: string;
};

export function JobCard({
  job,
  taskCounts = { open: 0, done: 0 },
  updatedAfterLastTicketSync = false,
  extraMeta,
}: JobCardProps) {
  const needsWrapUpReminder = jobNeedsWrapUpReminder(job, null);
  const wrapUpRecorded = Boolean((job.prodWrapUpNotes ?? '').trim());
  const sub = jobSecondaryHeading(job);
  const hasQbEstimate =
    Boolean(job.quickbooksEstimateId) && !isSyntheticQuickBooksId(job.quickbooksEstimateId);
  const hasQbInvoice =
    Boolean(job.quickbooksInvoiceId) && !isSyntheticQuickBooksId(job.quickbooksInvoiceId);
  const invoicePaidInFull =
    job.invoiceAmountCents > 0 && job.amountPaidCents >= job.invoiceAmountCents;
  const { open: taskOpen, done: taskDone } = taskCounts;
  const taskSummaryTitle =
    taskOpen > 0 && taskDone > 0
      ? `${taskOpen} open, ${taskDone} done`
      : taskOpen > 0
        ? `${taskOpen} open`
        : taskDone > 0
          ? `${taskDone} completed`
          : '';

  return (
    <div className="card">
      <Link href={`/dashboard/jobs/${job.id}`} className="card-main-link">
        <div className="job-card-title">
          <strong>{jobPrimaryHeading(job)}</strong>
        </div>
        {sub ? <div className="job-card-subtitle">{sub}</div> : null}
        <div className="job-card-badges d-flex flex-wrap gap-1 align-items-center" aria-label="Ticket links">
          {hasQbEstimate ? (
            <span className="badge rounded-pill bg-primary-subtle text-primary-emphasis border border-primary-subtle small fw-semibold">
              Est
            </span>
          ) : null}
          {hasQbInvoice ? (
            <span className="badge rounded-pill bg-info-subtle text-info-emphasis border border-info-subtle small fw-semibold">
              Inv
            </span>
          ) : null}
          {invoicePaidInFull ? (
            <span className="badge rounded-pill bg-success-subtle text-success-emphasis border border-success-subtle small fw-semibold">
              Paid
            </span>
          ) : null}
          {taskOpen > 0 ? (
            <span
              className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle small fw-semibold d-inline-flex align-items-center gap-1"
              title={taskSummaryTitle || `${taskOpen} open`}
            >
              <i className="material-icons-outlined" style={{ fontSize: 13, lineHeight: 1 }} aria-hidden>
                checklist
              </i>
              {taskOpen}
            </span>
          ) : taskDone > 0 ? (
            <span
              className="badge rounded-pill bg-light text-body-secondary border small fw-semibold d-inline-flex align-items-center gap-1"
              title={taskSummaryTitle}
            >
              <i className="material-icons-outlined" style={{ fontSize: 13, lineHeight: 1 }} aria-hidden>
                task_alt
              </i>
              {taskDone}
            </span>
          ) : null}
          {updatedAfterLastTicketSync ? (
            <span
              className="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle small d-inline-flex align-items-center p-1"
              title="This ticket was updated in Dash after the last QuickBooks sync — run Sync to refresh amounts and status from QuickBooks."
            >
              <i className="material-icons-outlined" style={{ fontSize: 14, lineHeight: 1 }} aria-hidden>
                sync
              </i>
            </span>
          ) : null}
          {job.googleDriveFolderId ? (
            <span
              className="badge rounded-pill bg-light text-body-secondary border small d-inline-flex align-items-center p-1"
              title="Google Drive folder linked"
            >
              <i className="material-icons-outlined" style={{ fontSize: 15, lineHeight: 1 }} aria-hidden>
                folder_special
              </i>
            </span>
          ) : null}
          {job.gmailThreadId ? (
            <span
              className="badge rounded-pill bg-light text-body-secondary border small d-inline-flex align-items-center p-1"
              title="Gmail thread linked"
            >
              <i className="material-icons-outlined" style={{ fontSize: 15, lineHeight: 1 }} aria-hidden>
                mail
              </i>
            </span>
          ) : null}
        </div>
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
      <JobWorkflowActions
        jobId={job.id}
        archived={job.archivedAt != null}
        needsWrapUpReminder={needsWrapUpReminder}
        wrapUpRecorded={wrapUpRecorded}
      />
    </div>
  );
}
