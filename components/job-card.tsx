import type { ReactNode } from 'react';
import Link from 'next/link';
import { BoardStatus, Job } from '@prisma/client';
import { JobWorkflowActions } from '@/components/job-workflow-actions';
import { JobCardDragHandle } from '@/components/job-card-drag-handle';
import { PrequoteWorkflowActions } from '@/components/prequote-workflow-actions';
import type { DashboardColumnKey } from '@/lib/domain/board-display';
import { jobNeedsWrapUpReminder, jobWrapUpRecorded } from '@/lib/domain/production-workflow';
import { boardStatusDisplayLabel, leadTicketQuotedColumnHint } from '@/lib/domain/board-display';
import {
  inboundLeadKindPillClassName,
  inboundLeadKindShortLabel,
  inboundLeadKindTitleAttr,
  jobIsLeadFirstTicket,
} from '@/lib/domain/lead-ticket';
import {
  inboundCardSubtitleFromStoredDescription,
  inboundLeadCardDisplayParts,
  jobPrimaryHeading,
  jobSecondaryHeading,
} from '@/lib/domain/job-display';
import { InboundLeadConversationPanel } from '@/components/inbound-lead-conversation-panel';
import { isSyntheticQuickBooksId } from '@/lib/quickbooks/invoice-activity';
import { thinLeadBadgeTitle, type LeadSubstanceResult } from '@/lib/domain/lead-substance';
import { fmtDetailDate } from '@/lib/ticket/format';

type JobCardProps = {
  job: Job;
  /** Ticket-linked tasks: `open` undone, `done` completed. */
  taskCounts?: { open: number; done: number };
  /** True when this ticket was edited in Dash after the last “Sync from QuickBooks” (totals may need a refresh). */
  updatedAfterLastTicketSync?: boolean;
  extraMeta?: string;
  /** When set (e.g. main Tickets board), shows a checkbox for multi-select. Must render inside `TicketBoardMultiSelectProvider`. */
  selectionSlot?: ReactNode;
  /** When set (main Tickets board), shows a drag handle. Must render inside `TicketBoardDndProvider`. */
  boardColumn?: DashboardColumnKey;
  /** Pre-quote triage: thin-lead scoring from the pre-quote board. */
  leadSubstance?: LeadSubstanceResult | null;
};

export function JobCard({
  job,
  taskCounts = { open: 0, done: 0 },
  updatedAfterLastTicketSync = false,
  extraMeta,
  selectionSlot,
  boardColumn,
  leadSubstance = null,
}: JobCardProps) {
  const needsWrapUpReminder = jobNeedsWrapUpReminder(job, null);
  const wrapUpRecorded = jobWrapUpRecorded(job);

  const inboundParts = inboundLeadCardDisplayParts(job);
  let sub: string | null = null;
  let inboundPanel: ReactNode = null;

  if (inboundParts) {
    let syn = inboundParts.synopsis.trim();
    if (syn.length > 320) syn = `${syn.slice(0, 320).trimEnd()}…`;
    sub = syn.length > 0 ? syn : null;
    if (inboundParts.transcript || inboundParts.metaBlocks.length > 0) {
      inboundPanel = (
        <InboundLeadConversationPanel transcript={inboundParts.transcript} metaBlocks={inboundParts.metaBlocks} />
      );
    }
  } else {
    let raw = jobSecondaryHeading(job);
    if (raw && job.inboundLeadKind != null) {
      raw = inboundCardSubtitleFromStoredDescription(raw);
      if (!raw.trim()) raw = null;
      else {
        const max = 320;
        if (raw.length > max) raw = `${raw.slice(0, max).trimEnd()}…`;
      }
    }
    sub = raw;
  }

  const isLeadFirst = jobIsLeadFirstTicket(job);
  const isPrequoteTicket = job.boardStatus === BoardStatus.REQUESTED;
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

  const qbQuotedHint = leadTicketQuotedColumnHint(job);

  const mainLink = (
    <>
      <Link
        href={`/dashboard/jobs/${job.id}`}
        className={selectionSlot ? 'card-main-link job-card-main-link-fill' : 'card-main-link'}
      >
        <div className="job-card-title">
          <strong>{jobPrimaryHeading(job)}</strong>
        </div>
        {sub ? <div className="job-card-subtitle">{sub}</div> : null}
        <div className="job-card-badges d-flex flex-wrap gap-1 align-items-center" aria-label="Ticket links">
          {job.inboundLeadKind != null ? (
            <span
              className={`badge rounded-pill small fw-semibold border ${inboundLeadKindPillClassName(job.inboundLeadKind)}`}
              title={inboundLeadKindTitleAttr(job.inboundLeadKind)}
            >
              {inboundLeadKindShortLabel(job.inboundLeadKind)}
            </span>
          ) : null}
          {leadSubstance?.thin ? (
            <span
              className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle small fw-semibold"
              title={thinLeadBadgeTitle(leadSubstance)}
            >
              Thin
            </span>
          ) : null}
          {leadSubstance && !leadSubstance.thin && leadSubstance.hasContact ? (
            <span
              className="badge rounded-pill bg-success-subtle text-success-emphasis border border-success-subtle small fw-semibold"
              title="Contact info found (email or phone)"
            >
              Contact
            </span>
          ) : null}
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
        {isLeadFirst ? (
          <div className="job-card-lead-meta text-body-secondary small">
            Lead · Added {fmtDetailDate(job.createdAt)} · Updated {fmtDetailDate(job.updatedAt)}
          </div>
        ) : (
          <>
            <div className="job-card-estimate">
              Estimate: ${(job.estimateAmountCents / 100).toFixed(2)}
            </div>
            {qbQuotedHint ? <div className="job-card-prequote-qb-hint small text-body-secondary">{qbQuotedHint}</div> : null}
            <div className="job-card-invoice">
              Invoice paid: ${(job.amountPaidCents / 100).toFixed(2)} / $
              {(job.invoiceAmountCents / 100).toFixed(2)}
            </div>
            <div className="job-card-quickbooks">
              QuickBooks date: {job.qbOrderingAt ? fmtDetailDate(job.qbOrderingAt) : 'n/a'}; Dash created{' '}
              {fmtDetailDate(job.createdAt)}
            </div>
            <div className="job-card-updated">Updated {fmtDetailDate(job.updatedAt)}</div>
          </>
        )}
        {extraMeta ? <div className="job-card-extra card-extra-meta">{extraMeta}</div> : null}
        <div className="job-card-status badge">{boardStatusDisplayLabel(job.boardStatus)}</div>
        <span className="job-card-open-hint card-open-hint">Open ticket →</span>
      </Link>
      {inboundPanel ? <div className="job-card-inbound-panel-wrap">{inboundPanel}</div> : null}
    </>
  );

  const workflow = isPrequoteTicket ? (
      <PrequoteWorkflowActions
        jobId={job.id}
        archived={job.archivedAt != null}
        showDismiss={leadSubstance?.thin ?? false}
      />
    ) : (
      <JobWorkflowActions
        jobId={job.id}
        archived={job.archivedAt != null}
        needsWrapUpReminder={needsWrapUpReminder}
        wrapUpRecorded={wrapUpRecorded}
      />
    );

  return (
    <div
      className={[
        'card',
        selectionSlot ? 'job-card-with-select' : '',
        boardColumn ? 'job-card-draggable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {boardColumn ? <JobCardDragHandle jobId={job.id} column={boardColumn} /> : null}
      {selectionSlot ? (
        <div className="job-card-select-row">
          <div className="job-card-select-control">{selectionSlot}</div>
          {mainLink}
        </div>
      ) : (
        mainLink
      )}
      {workflow}
    </div>
  );
}
