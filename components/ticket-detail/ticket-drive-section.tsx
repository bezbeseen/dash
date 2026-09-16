import type { BoardStatus, ProductionStatus } from '@prisma/client';
import type { DriveFolderListItem } from '@/lib/drive/api';
import {
  getClientJobsRootFolderId,
  getCustomerHubFolderId,
  getJobFolderTemplateId,
  isGoogleDriveBucketSyncConfigured,
} from '@/lib/drive/config';
import { driveBucketForJob } from '@/lib/drive/resolve-bucket';
import { fmtDetailDate } from '@/lib/ticket/format';

function bucketLabel(bucket: 'ACTIVE' | 'COMPLETED' | 'ARCHIVE'): string {
  switch (bucket) {
    case 'ACTIVE':
      return 'Active';
    case 'COMPLETED':
      return 'Completed';
    case 'ARCHIVE':
      return 'Archive';
  }
}

type Props = {
  sectionId?: string;
  jobId: string;
  archivedAt: Date | null;
  boardStatus: BoardStatus;
  productionStatus: ProductionStatus;
  googleDriveFolderId: string | null;
  googleDriveSyncedAt: Date | null;
  googleDriveLastError: string | null;
  driveChildren: DriveFolderListItem[];
  driveListError: string | null;
  canCreateFromTemplate: boolean;
  customerFolder: { id: string; name: string } | null;
  hasQboDocs: boolean;
};

export function TicketDriveSection({
  sectionId,
  jobId,
  archivedAt,
  boardStatus,
  productionStatus,
  googleDriveFolderId,
  googleDriveSyncedAt,
  googleDriveLastError,
  driveChildren,
  driveListError,
  canCreateFromTemplate,
  customerFolder,
  hasQboDocs,
}: Props) {
  const bucketsOk = isGoogleDriveBucketSyncConfigured();
  const clientJobsLayout = Boolean(getClientJobsRootFolderId());
  const hubConfigured = Boolean(getCustomerHubFolderId());
  const bucket = driveBucketForJob({ archivedAt, boardStatus, productionStatus });
  const folderHref = googleDriveFolderId
    ? `https://drive.google.com/drive/folders/${googleDriveFolderId}`
    : null;
  const customerHref = customerFolder
    ? `https://drive.google.com/drive/folders/${customerFolder.id}`
    : null;

  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Google Drive</h2>
      <p className="small text-body-secondary mb-3">
        {clientJobsLayout
          ? `Creates a new job folder from your template under this customer’s ${bucketLabel(bucket)} stage folder. Invoice and estimate PDFs go in that job folder.`
          : 'Creates a new job folder from your template in the Active jobs folder. Invoice and estimate PDFs go in that job folder (invoices/quotes subfolder when the template has one). Prepaid tickets stay in Active until the job is delivered; then the folder moves to Completed, or Archive when the ticket is Done.'}
      </p>
      {!bucketsOk ? (
        <p className="small text-warning-emphasis mb-3">
          Folder moves need Active, Completed, and Archive folder ids in the server environment.{' '}
          <a href="/api/integrations/env-check" target="_blank" rel="noreferrer">
            Open env-check
          </a>
        </p>
      ) : null}
      <dl className="detail-kv mb-3">
        <dt>This ticket’s Drive bucket</dt>
        <dd>{bucketLabel(bucket)}</dd>
        {clientJobsLayout || hubConfigured ? (
          <>
            <dt>{clientJobsLayout ? 'Customer folder' : 'Customer hub'}</dt>
            <dd>
              {customerFolder && customerHref ? (
                <a href={customerHref} target="_blank" rel="noreferrer">
                  {customerFolder.name}
                </a>
              ) : clientJobsLayout ? (
                'Created with the job folder if it does not exist yet'
              ) : (
                'A shortcut is added here when the job folder is created or moved'
              )}
            </dd>
          </>
        ) : null}
        <dt>Last folder sync</dt>
        <dd>{fmtDetailDate(googleDriveSyncedAt)}</dd>
      </dl>
      {googleDriveLastError ? (
        <div className="board-toast board-toast-error mb-3" role="status">
          {googleDriveLastError}
          <p className="small mb-0 mt-2">
            <a href="/api/integrations/env-check" target="_blank" rel="noreferrer">
              Open env-check
            </a>{' '}
            and look at googleDrive.accessProbe to see which folder id Google cannot open.
          </p>
        </div>
      ) : null}
      {canCreateFromTemplate ? (
        <form action={`/api/jobs/${jobId}/drive-create-from-template`} method="post" className="mb-3">
          <button type="submit" className="btn btn-primary btn-sm">
            Create job folder from template
          </button>
          <p className="small text-body-secondary mt-2 mb-0">
            {clientJobsLayout
              ? `Copies the template into this customer’s ${bucketLabel(bucket)} folder, named with the customer, date, and project.`
              : `Copies the template into ${bucketLabel(bucket)}, named with the customer, date, and project.`}
            {hasQboDocs ? ' Adds the QuickBooks invoice/estimate PDFs once the folder exists.' : ''}
          </p>
        </form>
      ) : null}
      {!googleDriveFolderId && !getJobFolderTemplateId() ? (
        <p className="small text-warning-emphasis mb-3" role="status">
          Create folder from template needs <code className="small">GOOGLE_DRIVE_JOB_FOLDER_TEMPLATE_ID</code> in the
          server environment.{' '}
          <a href="/api/integrations/env-check" target="_blank" rel="noreferrer">
            Open env-check
          </a>
        </p>
      ) : null}
      {clientJobsLayout && !googleDriveFolderId ? (
        <form action={`/api/jobs/${jobId}/drive-customer-folder`} method="post" className="mb-3">
          <label className="form-label small fw-semibold" htmlFor={`drive-customer-folder-${jobId}`}>
            Optional: paste this customer’s folder URL
          </label>
          <input
            id={`drive-customer-folder-${jobId}`}
            name="folderIdOrUrl"
            type="text"
            className="form-control form-control-sm mb-2"
            placeholder="https://drive.google.com/drive/folders/..."
            defaultValue=""
            autoComplete="off"
          />
          <button type="submit" className="btn btn-toolbar btn-sm">
            Save customer folder
          </button>
          <p className="small text-body-secondary mt-2 mb-0">
            Use this only if the customer folder name does not match the ticket. The job folder is still created from
            the template inside that customer’s Active stage folder.
          </p>
        </form>
      ) : null}
      <form action={`/api/jobs/${jobId}/drive-folder`} method="post" className="mb-3">
        <label className="form-label small fw-semibold" htmlFor={`drive-folder-${jobId}`}>
          {googleDriveFolderId ? 'Job folder URL or ID' : 'Or link an existing job folder'}
        </label>
        <input
          id={`drive-folder-${jobId}`}
          name="folderIdOrUrl"
          type="text"
          className="form-control form-control-sm mb-2"
          placeholder="https://drive.google.com/drive/folders/..."
          defaultValue={googleDriveFolderId ?? ''}
          autoComplete="off"
        />
        <div className="d-flex flex-wrap gap-2">
          <button type="submit" className="btn btn-toolbar btn-sm">
            Save
          </button>
          {folderHref ? (
            <a className="btn btn-toolbar btn-sm" href={folderHref} target="_blank" rel="noreferrer">
              Open in Drive
            </a>
          ) : null}
        </div>
        <p className="small text-body-secondary mt-2 mb-0">
          {googleDriveFolderId
            ? 'Leave empty and save to unlink this job folder from the ticket.'
            : 'Skip this if you are creating from the template. This field is for a job folder that already exists, not the customer folder.'}
        </p>
      </form>
      {googleDriveFolderId && bucketsOk ? (
        <form action={`/api/jobs/${jobId}/drive-sync`} method="post" className="mb-3">
          <button type="submit" className="btn btn-toolbar btn-toolbar-muted btn-sm">
            Move folder now (match ticket)
          </button>
          <p className="small text-body-secondary mt-2 mb-0">
            Moves this job folder to {bucketLabel(bucket)} to match the ticket, and refreshes invoice PDFs.
          </p>
        </form>
      ) : null}
      {googleDriveFolderId && driveListError ? (
        <p className="small text-danger mb-2">Could not list files: {driveListError}</p>
      ) : null}
      {googleDriveFolderId && driveChildren.length > 0 ? (
        <>
          <h3 className="h6 fw-semibold mt-3 mb-2">Job folder contents (preview)</h3>
          <ul className="list-unstyled small mb-0" style={{ maxHeight: '14rem', overflow: 'auto' }}>
            {driveChildren.map((f) => (
              <li key={f.id} className="py-1 border-bottom border-secondary-subtle">
                {f.webViewLink ? (
                  <a href={f.webViewLink} target="_blank" rel="noreferrer" className="text-break">
                    {f.name}
                  </a>
                ) : (
                  <span className="text-break">{f.name}</span>
                )}
                {f.mimeType === 'application/vnd.google-apps.folder' ? (
                  <span className="text-body-secondary ms-1">(folder)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
