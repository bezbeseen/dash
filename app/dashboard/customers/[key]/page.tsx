import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { customerCrmHref, jobOutstandingCents, parseCustomerCrmKey } from '@/lib/domain/customers';
import {
  displayJobMoney,
  fetchLiveJobMoney,
  persistHydratedJobs,
  type JobMoneyFields,
  type LiveJobDocs,
} from '@/lib/domain/hydrate-job-money';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';
import { jobDisplayTitle, jobSecondaryHeading } from '@/lib/domain/job-display';
import { fetchCustomerUnappliedPaymentCents, fetchQboCustomerContact } from '@/lib/quickbooks/client';
import { resolveRealmIdForJob } from '@/lib/quickbooks/realm';
import { fmtShortDate, fmtUsd, labelEnum } from '@/lib/ticket/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type PageProps = {
  params: Promise<{ key: string }>;
};

const JOB_SELECT = {
  id: true,
  customerName: true,
  projectName: true,
  projectDescription: true,
  boardStatus: true,
  archivedAt: true,
  archiveReason: true,
  estimateStatus: true,
  invoiceStatus: true,
  estimateAmountCents: true,
  invoiceAmountCents: true,
  amountPaidCents: true,
  quickbooksCustomerId: true,
  quickbooksCompanyId: true,
  quickbooksEstimateId: true,
  quickbooksInvoiceId: true,
  updatedAt: true,
} as const;

export default async function CustomerDetailPage({ params }: PageProps) {
  const { key: rawKey } = await params;
  const parsed = parseCustomerCrmKey(rawKey);
  if (!parsed) notFound();

  const jobs =
    parsed.kind === 'qbo'
      ? await prisma.job.findMany({
          where: { quickbooksCustomerId: parsed.id },
          orderBy: { updatedAt: 'desc' },
          select: JOB_SELECT,
        })
      : await prisma.job.findMany({
          where: {
            customerName: { equals: parsed.name, mode: 'insensitive' },
            OR: [{ quickbooksCustomerId: null }, { quickbooksCustomerId: '' }],
          },
          orderBy: { updatedAt: 'desc' },
          select: JOB_SELECT,
        });

  if (parsed.kind === 'name' && jobs.length === 0) {
    const named = await prisma.job.findMany({
      where: { customerName: { equals: parsed.name, mode: 'insensitive' } },
      select: { quickbooksCustomerId: true, customerName: true },
    });
    const qboIds = [
      ...new Set(named.map((j) => j.quickbooksCustomerId?.trim()).filter((id): id is string => Boolean(id))),
    ];
    if (qboIds.length === 1) {
      const name = named.find((j) => j.quickbooksCustomerId?.trim() === qboIds[0])?.customerName || parsed.name;
      redirect(
        customerCrmHref({ quickbooksCustomerId: qboIds[0], customerName: name }) as never,
      );
    }
  }

  if (jobs.length === 0) notFound();

  const displayNameFromJobs =
    jobs.find((j) => j.customerName.trim())?.customerName.trim() ||
    (parsed.kind === 'name' ? parsed.name : 'Customer');
  const qboId =
    parsed.kind === 'qbo' ? parsed.id : jobs.find((j) => j.quickbooksCustomerId?.trim())?.quickbooksCustomerId?.trim() || null;
  const realmId = await resolveRealmIdForJob(jobs[0].quickbooksCompanyId);

  let qboContact = null as Awaited<ReturnType<typeof fetchQboCustomerContact>>;
  let qboContactError: string | null = null;
  let unappliedDepositCents: number | null = null;
  let liveByJobId = new Map<string, LiveJobDocs>();
  if (realmId) {
    const [contactResult, unappliedResult, liveResult] = await Promise.all([
      qboId
        ? fetchQboCustomerContact(realmId, qboId).then(
            (c) => ({ ok: true as const, c }),
            (e: unknown) => ({
              ok: false as const,
              error: e instanceof Error ? e.message.slice(0, 180) : 'QuickBooks customer lookup failed',
            }),
          )
        : Promise.resolve(null),
      qboId
        ? fetchCustomerUnappliedPaymentCents(realmId, qboId).then(
            (cents) => cents,
            () => null,
          )
        : Promise.resolve(null),
      fetchLiveJobMoney(realmId, jobs),
    ]);
    if (contactResult) {
      if (contactResult.ok) qboContact = contactResult.c;
      else qboContactError = contactResult.error;
    }
    unappliedDepositCents = unappliedResult;
    liveByJobId = liveResult;
  }
  const storedById = new Map<string, JobMoneyFields>(
    jobs.map((job) => [
      job.id,
      {
        estimateAmountCents: job.estimateAmountCents,
        invoiceAmountCents: job.invoiceAmountCents,
        amountPaidCents: job.amountPaidCents,
        estimateStatus: job.estimateStatus,
        invoiceStatus: job.invoiceStatus,
      },
    ]),
  );
  const displayJobs = jobs.map((job) => {
    const live = liveByJobId.get(job.id) ?? { estimate: null, invoice: null };
    return { ...job, ...displayJobMoney(job, live) };
  });
  await persistHydratedJobs(displayJobs, liveByJobId, storedById);

  const companyId = jobs.find((j) => j.quickbooksCompanyId)?.quickbooksCompanyId ?? null;
  const driveFolder =
    companyId && qboId
      ? await prisma.customerDriveFolder.findUnique({
          where: {
            quickbooksCompanyId_quickbooksCustomerId: {
              quickbooksCompanyId: companyId,
              quickbooksCustomerId: qboId,
            },
          },
          select: { googleDriveFolderId: true },
        })
      : null;

  const name = qboContact?.displayName || displayNameFromJobs;
  const outstandingCents = displayJobs.reduce((sum, job) => sum + jobOutstandingCents(job), 0);
  const estimatedCents = displayJobs.reduce((sum, job) => sum + job.estimateAmountCents, 0);
  const invoicedCents = displayJobs.reduce((sum, job) => sum + job.invoiceAmountCents, 0);
  const paidCents = displayJobs.reduce((sum, job) => sum + job.amountPaidCents, 0);
  const openJobs = displayJobs.filter((j) => j.archivedAt == null);
  const archivedJobs = displayJobs.filter((j) => j.archivedAt != null);
  const email = qboContact?.email ?? null;
  const phone = qboContact?.phone ?? null;

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">{name}</h1>
          <p className="board-topbar-sub">
            Jobs, estimates, invoices, and payments for this customer.
            {qboId
              ? ' Contact, open balance, and unapplied deposits come from QuickBooks. Ticket money is refreshed from the estimate/invoice ids on each job.'
              : ' No QuickBooks customer id on these tickets yet — contact is not loaded from QBO.'}
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard/customers" className="btn btn-toolbar">
            All customers
          </Link>
          <Link href="/dashboard/tickets" className="btn btn-toolbar btn-toolbar-muted">
            Tickets
          </Link>
        </div>
      </header>

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-4" style={{ minHeight: 0 }}>
        <section className="card border rounded-3 p-4 mb-3 bg-body">
          <h2 className="h6 fw-semibold mb-3">Contact</h2>
          {qboContactError ? (
            <p className="small text-warning mb-3" role="status">
              Could not load QuickBooks contact. Showing ticket data only. {qboContactError}
            </p>
          ) : null}
          <dl className="row mb-0 small">
            <dt className="col-sm-3 col-lg-2 text-body-secondary">Name</dt>
            <dd className="col-sm-9 col-lg-10">{name}</dd>
            <dt className="col-sm-3 col-lg-2 text-body-secondary">Email</dt>
            <dd className="col-sm-9 col-lg-10">
              {email ? (
                <a href={`mailto:${email}`}>{email}</a>
              ) : qboId && realmId && !qboContactError ? (
                <span className="text-body-secondary">None in QuickBooks</span>
              ) : (
                <span className="text-body-secondary">—</span>
              )}
            </dd>
            <dt className="col-sm-3 col-lg-2 text-body-secondary">Phone</dt>
            <dd className="col-sm-9 col-lg-10">
              {phone ? (
                <a href={`tel:${phone}`}>{phone}</a>
              ) : qboId && realmId && !qboContactError ? (
                <span className="text-body-secondary">None in QuickBooks</span>
              ) : (
                <span className="text-body-secondary">—</span>
              )}
            </dd>
            {qboContact?.billAddress ? (
              <>
                <dt className="col-sm-3 col-lg-2 text-body-secondary">Address</dt>
                <dd className="col-sm-9 col-lg-10">{qboContact.billAddress}</dd>
              </>
            ) : null}
            <dt className="col-sm-3 col-lg-2 text-body-secondary">QuickBooks ID</dt>
            <dd className="col-sm-9 col-lg-10">
              {qboId ? <span className="detail-mono">{qboId}</span> : '—'}
            </dd>
            {driveFolder?.googleDriveFolderId ? (
              <>
                <dt className="col-sm-3 col-lg-2 text-body-secondary">Drive folder</dt>
                <dd className="col-sm-9 col-lg-10">
                  <a
                    href={`https://drive.google.com/drive/folders/${driveFolder.googleDriveFolderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Drive
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <div className="row g-3 mb-3">
          <div className="col-6 col-lg-3">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Open tickets</p>
              <p className="fs-5 fw-semibold mb-0">{openJobs.length}</p>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Estimate / invoiced</p>
              <p className="fs-5 fw-semibold mb-0">
                {fmtUsd(estimatedCents)}
                <span className="text-body-secondary fw-normal"> / {fmtUsd(invoicedCents)}</span>
              </p>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Paid / outstanding</p>
              <p className="fs-5 fw-semibold mb-0">
                {fmtUsd(paidCents)}
                <span className="text-body-secondary fw-normal"> / {fmtUsd(outstandingCents)}</span>
              </p>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">QBO open balance</p>
              <p className="fs-5 fw-semibold mb-0">
                {qboContact?.balanceCents != null ? fmtUsd(qboContact.balanceCents) : '—'}
              </p>
              {unappliedDepositCents != null ? (
                <p className="small text-body-secondary mb-0 mt-1">
                  Unapplied deposits {fmtUsd(unappliedDepositCents)}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <CustomerJobsTable title="Open tickets" jobs={openJobs} empty="No open tickets." />
        {archivedJobs.length > 0 ? (
          <CustomerJobsTable title="Archived" jobs={archivedJobs} empty="No archived tickets." />
        ) : null}
      </div>
    </div>
  );
}

function CustomerJobsTable({
  title,
  jobs,
  empty,
}: {
  title: string;
  jobs: Array<{
    id: string;
    customerName: string;
    projectName: string;
    projectDescription: string | null;
    boardStatus: Parameters<typeof boardStatusDisplayLabel>[0];
    archivedAt: Date | null;
    estimateStatus: Parameters<typeof labelEnum>[0];
    invoiceStatus: Parameters<typeof labelEnum>[0];
    estimateAmountCents: number;
    invoiceAmountCents: number;
    amountPaidCents: number;
    quickbooksEstimateId: string | null;
    quickbooksInvoiceId: string | null;
    updatedAt: Date;
  }>;
  empty: string;
}) {
  return (
    <section className="card border rounded-3 p-4 mb-3 bg-body">
      <h2 className="h6 fw-semibold mb-3">
        {title}{' '}
        <span className="badge bg-body-secondary text-body rounded-pill">{jobs.length}</span>
      </h2>
      {jobs.length === 0 ? (
        <p className="small text-body-secondary mb-0">{empty}</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Ticket</th>
                <th>Status</th>
                <th className="text-end">Estimate</th>
                <th className="text-end">Invoice</th>
                <th className="text-end">Paid / deposit</th>
                <th className="text-end">Open</th>
                <th className="text-end d-none d-lg-table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const sub = jobSecondaryHeading(job);
                const open = jobOutstandingCents(job);
                return (
                  <tr key={job.id}>
                    <td>
                      <Link href={`/dashboard/jobs/${job.id}`} className="fw-semibold text-decoration-none">
                        {jobDisplayTitle(job)}
                      </Link>
                      {sub ? <div className="small text-body-secondary text-truncate">{sub}</div> : null}
                      <div className="small text-body-secondary">
                        {job.quickbooksEstimateId ? 'Estimate' : null}
                        {job.quickbooksEstimateId && job.quickbooksInvoiceId ? ' · ' : null}
                        {job.quickbooksInvoiceId ? 'Invoice' : null}
                        {!job.quickbooksEstimateId && !job.quickbooksInvoiceId ? 'No QBO document yet' : null}
                      </div>
                    </td>
                    <td>
                      <span className="badge bg-primary-subtle text-primary">
                        {boardStatusDisplayLabel(job.boardStatus)}
                      </span>
                    </td>
                    <td className="text-end text-nowrap detail-mono">
                      {fmtUsd(job.estimateAmountCents)}
                      <div className="small text-body-secondary">{labelEnum(job.estimateStatus)}</div>
                    </td>
                    <td className="text-end text-nowrap detail-mono">
                      {fmtUsd(job.invoiceAmountCents)}
                      <div className="small text-body-secondary">{labelEnum(job.invoiceStatus)}</div>
                    </td>
                    <td className="text-end text-nowrap detail-mono">{fmtUsd(job.amountPaidCents)}</td>
                    <td className={`text-end text-nowrap detail-mono${open > 0 ? ' fw-semibold' : ' text-body-secondary'}`}>
                      {fmtUsd(open)}
                    </td>
                    <td className="text-end small text-body-secondary text-nowrap d-none d-lg-table-cell">
                      {fmtShortDate(job.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
