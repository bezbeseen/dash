import type { BoardStatus } from '@prisma/client';
import type { DriveFolderListItem } from '@/lib/drive/api';
import { getJobFolderTemplateId, isGoogleDriveBucketSyncConfigured } from '@/lib/drive/config';
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
  googleDriveFolderId: string | null;
  googleDriveSyncedAt: Date | null;
  googleDriveLastError: string | null;
  driveChildren: DriveFolderListItem[];
  driveListError: string | null;
  canCreateFromTemplate: boolean;
};

export function TicketDriveSection({
  sectionId,
  jobId,
  archivedAt,
  boardStatus,
  googleDriveFolderId,
  googleDriveSyncedAt,
  googleDriveLastError,
  driveChildren,
  driveListError,
  canCreateFromTemplate,
}: Props) {
  const bucketsOk = isGoogleDriveBucketSyncConfigured();
  const bucket = driveBucketForJob({ archivedAt, boardStatus });
  const folderHref = googleDriveFolderId
    ? `https://drive.google.com/drive/folders/${googleDriveFolderId}`
    : null;

  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Google Drive</h2>
      <p className="small text-body-secondary mb-3">
        Link the job folder once, or create one from your Drive template. The dash moves it under Active, Completed, or
        Archive when the ticket changes (and after QuickBooks sync). Uses the same Google account as the ticket Gmail
        mailbox when set, otherwise the most recently connected mailbox.
      </p>
      {!bucketsOk ? (
        <p className="small text-warning-emphasis mb-3">
          Set <code className="small">GOOGLE_DRIVE_ACTIVE_FOLDER_ID</code>,{' '}
          <code className="small">GOOGLE_DRIVE_COMPLETED_FOLDER_ID</code>, and{' '}
          <code className="small">GOOGLE_DRIVE_ARCHIVE_FOLDER_ID</code> in the server environment to enable moves.
        </p>
      ) : null}
      <dl className="detail-kv mb-3">
        <dt>Drive bucket (from ticket)</dt>
        <dd>{bucketLabel(bucket)}</dd>
        <dt>Last folder sync</dt>
        <dd>{fmtDetailDate(googleDriveSyncedAt)}</dd>
      </dl>
      {googleDriveLastError ? (
        <div className="board-toast board-toast-error mb-3" role="status">
          {googleDriveLastError}
        </div>
      ) : null}
      {bucketsOk && !googleDriveFolderId && !getJobFolderTemplateId() ? (
        <p className="small text-warning-emphasis mb-3" role="status">
          <strong>Create folder from template</strong> is off until{' '}
          <code className="small">GOOGLE_DRIVE_JOB_FOLDER_TEMPLATE_ID</code> is set (template folder id or Drive URL).
          Add it for this Vercel environment (Production and/or Preview), redeploy, then hard-refresh. You can still paste
          a folder link below.
        </p>
      ) : null}
      {canCreateFromTemplate ? (
        <form action={`/api/jobs/${jobId}/drive-create-from-template`} method="post" className="mb-3">
          <button type="submit" className="btn btn-toolbar btn-sm">
            Create folder from template
          </button>
          <p className="small text-body-secondary mt-2 mb-0">
            Duplicates your template into <strong>Active</strong> and names it{' '}
            <code className="small">customer - date - project</code>. Clear the link first if you already have a folder.
          </p>
        </form>
      ) : null}
      <form action={`/api/jobs/${jobId}/drive-folder`} method="post" className="mb-3">
        <label className="form-label small fw-semibold" htmlFor={`drive-folder-${jobId}`}>
          Or paste job folder URL or ID
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
        <p className="small text-body-secondary mt-2 mb-0">Leave empty and save to clear the link.</p>
      </form>
      {googleDriveFolderId && bucketsOk ? (
        <form action={`/api/jobs/${jobId}/drive-sync`} method="post" className="mb-3">
          <button type="submit" className="btn btn-toolbar btn-toolbar-muted btn-sm">
            Move folder now (match ticket)
          </button>
        </form>
      ) : null}
      {googleDriveFolderId && driveListError ? (
        <p className="small text-danger mb-2">Could not list files: {driveListError}</p>
      ) : null}
      {googleDriveFolderId && driveChildren.length > 0 ? (
        <>
          <h3 className="h6 fw-semibold mt-3 mb-2">Contents (preview)</h3>
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
