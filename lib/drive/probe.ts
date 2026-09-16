import { assertDriveFolderAccessible } from '@/lib/drive/api';
import {
  driveParentIdForBucket,
  getClientJobsRootFolderId,
  getCustomerHubFolderId,
  getJobFolderTemplateId,
} from '@/lib/drive/config';
import { getGmailOAuth2ClientForConnection } from '@/lib/gmail/tokens-db';

export type DriveFolderAccessProbe = {
  key: string;
  envVar: string;
  set: boolean;
  ok: boolean;
  error?: string;
};

export type GoogleDriveAccessProbe = {
  mailbox: string;
  timedOut?: boolean;
  folders: DriveFolderAccessProbe[];
};

/**
 * Confirms each configured Drive folder id is visible to this Gmail token (shared-drive safe).
 * Does not include folder ids in the result.
 */
export async function probeGoogleDriveFolderAccess(
  connectionId: string,
  mailboxEmail: string,
): Promise<GoogleDriveAccessProbe> {
  const auth = await getGmailOAuth2ClientForConnection(connectionId);
  const checks: { key: string; envVar: string; id: string | null }[] = [
    { key: 'template', envVar: 'GOOGLE_DRIVE_JOB_FOLDER_TEMPLATE_ID', id: getJobFolderTemplateId() },
    { key: 'active', envVar: 'GOOGLE_DRIVE_ACTIVE_FOLDER_ID', id: driveParentIdForBucket('ACTIVE') },
    { key: 'completed', envVar: 'GOOGLE_DRIVE_COMPLETED_FOLDER_ID', id: driveParentIdForBucket('COMPLETED') },
    { key: 'archive', envVar: 'GOOGLE_DRIVE_ARCHIVE_FOLDER_ID', id: driveParentIdForBucket('ARCHIVE') },
    { key: 'clientJobsRoot', envVar: 'GOOGLE_DRIVE_CLIENT_JOBS_ROOT_ID', id: getClientJobsRootFolderId() },
    { key: 'customerHub', envVar: 'GOOGLE_DRIVE_CUSTOMER_HUB_FOLDER_ID', id: getCustomerHubFolderId() },
  ];

  const folders: DriveFolderAccessProbe[] = await Promise.all(
    checks.map(async (check) => {
      if (!check.id) {
        return { key: check.key, envVar: check.envVar, set: false, ok: false };
      }
      try {
        await assertDriveFolderAccessible(auth, check.id, check.envVar);
        return { key: check.key, envVar: check.envVar, set: true, ok: true };
      } catch (e) {
        return {
          key: check.key,
          envVar: check.envVar,
          set: true,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  return { mailbox: mailboxEmail, folders };
}
