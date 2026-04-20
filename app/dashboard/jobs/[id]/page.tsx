import { notFound } from 'next/navigation';
import type { InvoiceSnapshot } from '@/lib/quickbooks/types';
import { prisma } from '@/lib/db/prisma';
import { TicketDocumentsSection } from '@/components/ticket-documents-section';
import { TicketLinkedEmailsSection } from '@/components/ticket-linked-emails-section';
import { TicketGmailSection } from '@/components/ticket-gmail-section';
import { TicketDetailBack } from '@/components/ticket-detail/ticket-detail-back';
import { TicketDetailHeader } from '@/components/ticket-detail/ticket-detail-header';
import { TicketArchivedBanner } from '@/components/ticket-detail/ticket-archived-banner';
import { TicketMoneySection } from '@/components/ticket-detail/ticket-money-section';
import { TicketProductionSection } from '@/components/ticket-detail/ticket-production-section';
import { TicketQuickBooksIdsSection } from '@/components/ticket-detail/ticket-qb-ids-section';
import { TicketQuickBooksInvoiceActivitySection } from '@/components/ticket-detail/ticket-qb-invoice-activity-section';
import type { InvoiceActivitySkipReason } from '@/components/ticket-detail/ticket-qb-invoice-activity-section';
import { TicketActionsSection } from '@/components/ticket-detail/ticket-actions-section';
import { TicketActivityLogSection } from '@/components/ticket-detail/ticket-activity-log-section';
import { TicketDetailFooter } from '@/components/ticket-detail/ticket-detail-footer';
import { TicketDetailToc, type TicketTocItem } from '@/components/ticket-detail/ticket-detail-toc';
import { TicketTasksSection } from '@/components/ticket-detail/ticket-tasks-section';
import { boardStatusForTicketHeader } from '@/lib/domain/derive-board-status';
import { fetchInvoiceById } from '@/lib/quickbooks/client';
import { fetchInvoiceActivityTimeline, isSyntheticQuickBooksId } from '@/lib/quickbooks/invoice-activity';
import type { InvoiceActivityTimeline } from '@/lib/quickbooks/types-activity';
import { resolveRealmIdForJob } from '@/lib/quickbooks/realm';
import { GMAIL_UI_MESSAGE_CAP } from '@/lib/gmail/ui-limits';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    email_error?: string;
    gmail_thread_error?: string;
    gmail_mailbox_error?: string;
    gmail_sync_error?: string;
    gmail_synced?: string;
    qb_imported?: string;
  }>;
};

export default async function JobDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const emailError = sp.email_error === 'empty';
  const gmailThreadError = sp.gmail_thread_error === '1';
  const gmailMailboxError = sp.gmail_mailbox_error === '1';
  const gmailSyncError = sp.gmail_sync_error ? decodeURIComponent(sp.gmail_sync_error) : null;
  const gmailSyncedOk = sp.gmail_synced === '1';
  const qbImportedOk = sp.qb_imported === '1';

  const gmailConnections = await prisma.gmailConnection.findMany({
    orderBy: { googleEmail: 'asc' },
    take: 3,
    select: { id: true, googleEmail: true },
  });

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      activityLogs: { orderBy: { createdAt: 'desc' } },
      linkedEmails: { orderBy: { createdAt: 'desc' } },
      gmailMessages: {
        orderBy: { date: 'desc' },
        take: GMAIL_UI_MESSAGE_CAP,
        include: { attachments: true },
      },
    },
  });

  if (!job) notFound();

  const gmailMessageTotalCount = await prisma.gmailSyncedMessage.count({ where: { jobId: id } });
  const gmailMessagesChronological = [...job.gmailMessages].reverse();
  const gmailMessagesUiTruncated = gmailMessageTotalCount > GMAIL_UI_MESSAGE_CAP;

  const realmId = await resolveRealmIdForJob(job.quickbooksCompanyId);
  let qboInvoice: InvoiceSnapshot | null = null;
  if (realmId && job.quickbooksInvoiceId) {
    try {
      qboInvoice = await fetchInvoiceById(realmId, job.quickbooksInvoiceId);
    } catch {
      qboInvoice = null;
    }
  }

  const headerBoardStatus = boardStatusForTicketHeader(job, qboInvoice);
  const invoiceTotalDisplayCents = qboInvoice?.totalAmtCents ?? job.invoiceAmountCents;
  const paidDisplayCents = qboInvoice?.amountPaidCents ?? job.amountPaidCents;

  let invoiceActivity: InvoiceActivityTimeline | null = null;
  let invoiceActivityError: string | null = null;
  let activitySkipped: InvoiceActivitySkipReason | null = null;

  if (!job.quickbooksInvoiceId) {
    activitySkipped = 'no_invoice';
  } else if (isSyntheticQuickBooksId(job.quickbooksInvoiceId)) {
    activitySkipped = 'synthetic_id';
  } else if (!realmId) {
    activitySkipped = 'no_realm';
  } else {
    try {
      invoiceActivity = await fetchInvoiceActivityTimeline(realmId, job.quickbooksInvoiceId);
    } catch (e) {
      invoiceActivityError = e instanceof Error ? e.message : 'Could not load invoice activity.';
    }
  }

  const hasEstimate = Boolean(job.quickbooksEstimateId);
  const hasInvoice = Boolean(job.quickbooksInvoiceId);
  const showPdfSection = hasEstimate || hasInvoice;

  const tocItems: TicketTocItem[] = [{ id: 'ticket-overview', label: 'Overview' }];
  if (job.archivedAt != null) {
    tocItems.push({ id: 'ticket-archived', label: 'Off board' });
  }
  tocItems.push(
    { id: 'ticket-money', label: 'Money' },
    { id: 'ticket-production', label: 'Production' },
    { id: 'ticket-quickbooks', label: 'QuickBooks IDs' },
    { id: 'ticket-qb-activity', label: 'Invoice activity' },
  );
  if (showPdfSection) {
    tocItems.push({ id: 'ticket-pdfs', label: 'PDFs' });
  }
  if (hasInvoice) {
    tocItems.push({ id: 'ticket-invoice-email', label: 'Invoice email' });
  }
  tocItems.push({ id: 'ticket-tasks', label: 'Tasks' });
  tocItems.push(
    { id: 'ticket-gmail', label: 'Gmail' },
    { id: 'ticket-seed-email', label: 'Seed email' },
    { id: 'ticket-actions', label: 'Actions' },
    { id: 'ticket-activity-log', label: 'Activity' },
    { id: 'ticket-meta', label: 'Job meta' },
  );

  return (
    <div className="board-page board-page-detail">
      {qbImportedOk ? (
        <div className="board-toasts px-3 px-md-4 pt-3" role="status">
          <div className="board-toast board-toast-ok">Invoice imported from QuickBooks.</div>
        </div>
      ) : null}
      <div className="ticket-detail-layout">
        <TicketDetailToc items={tocItems} />
        <div className="ticket-detail-main">
          <div id="ticket-overview" className="ticket-detail-panel ticket-detail-overview">
            <TicketDetailBack />
            <TicketDetailHeader
              projectName={job.projectName}
              projectDescription={job.projectDescription}
              customerName={job.customerName}
              boardStatus={headerBoardStatus}
              createdAt={job.createdAt}
              updatedAt={job.updatedAt}
            />
          </div>

          {job.archivedAt != null ? (
            <TicketArchivedBanner
              sectionId="ticket-archived"
              archivedAt={job.archivedAt}
              archiveReason={job.archiveReason}
            />
          ) : null}

          <TicketMoneySection
            sectionId="ticket-money"
            estimateAmountCents={job.estimateAmountCents}
            estimateStatus={job.estimateStatus}
            invoiceStatus={job.invoiceStatus}
            invoiceTotalDisplayCents={invoiceTotalDisplayCents}
            paidDisplayCents={paidDisplayCents}
            qboInvoice={qboInvoice}
          />

          <TicketProductionSection
            sectionId="ticket-production"
            productionStatus={job.productionStatus}
            startedAt={job.startedAt}
            readyAt={job.readyAt}
            deliveredAt={job.deliveredAt}
            paidAt={job.paidAt}
          />

          <TicketQuickBooksIdsSection
            sectionId="ticket-quickbooks"
            realmId={job.quickbooksCompanyId}
            customerId={job.quickbooksCustomerId}
            estimateId={job.quickbooksEstimateId}
            invoiceId={job.quickbooksInvoiceId}
          />

          <TicketQuickBooksInvoiceActivitySection
            sectionId="ticket-qb-activity"
            timeline={invoiceActivity}
            errorText={invoiceActivityError}
            skippedReason={activitySkipped}
          />

          <TicketDocumentsSection
            jobId={job.id}
            hasEstimate={hasEstimate}
            hasInvoice={hasInvoice}
            qboInvoice={qboInvoice}
            pdfSectionId="ticket-pdfs"
            invoiceEmailSectionId="ticket-invoice-email"
          />

          <TicketTasksSection sectionId="ticket-tasks" jobId={job.id} />

          <TicketGmailSection
            sectionId="ticket-gmail"
            jobId={job.id}
            gmailThreadId={job.gmailThreadId}
            gmailConnectionId={job.gmailConnectionId}
            connections={gmailConnections}
            messages={gmailMessagesChronological}
            gmailMessageTotalCount={gmailMessageTotalCount}
            gmailMessagesUiTruncated={gmailMessagesUiTruncated}
            threadError={gmailThreadError}
            mailboxError={gmailMailboxError}
            syncError={gmailSyncError}
            syncedOk={gmailSyncedOk}
          />

          <TicketLinkedEmailsSection
            sectionId="ticket-seed-email"
            jobId={job.id}
            links={job.linkedEmails}
            emailError={emailError}
          />

          <TicketActionsSection
            sectionId="ticket-actions"
            jobId={job.id}
            archived={job.archivedAt != null}
          />

          <TicketActivityLogSection sectionId="ticket-activity-log" logs={job.activityLogs} />

          <TicketDetailFooter sectionId="ticket-meta" jobId={job.id} />
        </div>
      </div>
    </div>
  );
}
