import type { BoardStatus, ProductionStatus } from '@prisma/client';
import type { DrivePreviewGroup } from '@/lib/drive/list-for-job';
import { DriveFileThumb } from '@/components/ticket-detail/drive-file-thumb';
import {
  getClientJobsRootFolderId,
  getCustomerHubFolderId,
  getJobFolderTemplateId,
  isGoogleDriveBucketSyncConfigured,
} from '@/lib/drive/config';
import { driveBucketForJob } from '@/lib/drive/resolve-bucket';
import { fmtDetailDate } from '@/lib/ticket/format';

function folderCountLabel(group: DrivePreviewGroup): string {
  const n = group.files.length + group.extraCount;
  if (n === 0) return 'Empty';
  if (group.extraCount > 0) return `${group.files.length}+`;
  return n === 1 ? '1 item' : `${n} items`;
}

function DriveFolderPreview({ jobId, groups }: { jobId: string; groups: DrivePreviewGroup[] }) {
  return (
    <div className="drive-folder-preview">
      <h3 className="h6 fw-semibold mt-3 mb-2">Job folder contents</h3>
      <p className="small text-body-secondary mb-2">Click a file to open it in Drive.</p>
      <div className="drive-folder-preview-list">
        {groups.map((group) => {
          const hasFiles = group.files.length > 0;
          return (
            <details key={group.id} className="drive-folder-group" open={hasFiles}>
              <summary>
                <span className="drive-folder-group-name">{group.name}</span>
                <span className="drive-folder-group-count">{folderCountLabel(group)}</span>
              </summary>
              {hasFiles ? (
                <div className="drive-file-thumbs">
                  {group.files.map((file) => (
                    <DriveFileThumb
                      key={file.id}
                      href={file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`}
                      name={file.name}
                      src={file.isFolder ? undefined : `/api/jobs/${jobId}/drive-preview/${file.id}`}
                      placeholder={file.isFolder ? 'Folder' : undefined}
                    />
                  ))}
                  {group.extraCount > 0 && group.webViewLink ? (
                    <DriveFileThumb
                      href={group.webViewLink}
                      name="More in Drive"
                      placeholder={`+${group.extraCount}`}
                    />
                  ) : null}
                </div>
              ) : (
                <p className="small text-body-secondary mb-0 drive-folder-empty">
                  Nothing in this folder yet
                  {group.webViewLink ? (
                    <>
                      {' · '}
                      <a href={group.webViewLink} target="_blank" rel="noreferrer">
                        Open in Drive
                      </a>
                    </>
                  ) : null}
                </p>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}

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
  drivePreviewGroups: DrivePreviewGroup[];
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
  drivePreviewGroups,
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
            and look at googleDrive.accessProbe. Create uses a mailbox that can see the shared drive, not the ticket’s Gmail thread.
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
      {googleDriveFolderId && drivePreviewGroups.length > 0 ? (
        <DriveFolderPreview jobId={jobId} groups={drivePreviewGroups} />
      ) : null}
    </section>
  );
}
