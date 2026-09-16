import type { OAuth2Client } from 'google-auth-library';
import { prisma } from '@/lib/db/prisma';
import { assertDriveFolderAccessible } from '@/lib/drive/api';
import {
  driveParentIdForBucket,
  getClientJobsRootFolderId,
  getCustomerHubFolderId,
  getJobFolderTemplateId,
} from '@/lib/drive/config';
import { getGmailOAuth2ClientForConnection } from '@/lib/gmail/tokens-db';

export type GoogleDriveAuth = {
  auth: OAuth2Client;
  mailbox: string;
};

function pinnedDriveMailbox(): string | null {
  const raw = process.env.GOOGLE_DRIVE_GMAIL?.trim().toLowerCase();
  return raw || null;
}

function defaultProbeFolder(): { id: string; label: string } | null {
  const template = getJobFolderTemplateId();
  if (template) return { id: template, label: 'Job folder template (GOOGLE_DRIVE_JOB_FOLDER_TEMPLATE_ID)' };
  const active = driveParentIdForBucket('ACTIVE');
  if (active) return { id: active, label: 'Active jobs folder (GOOGLE_DRIVE_ACTIVE_FOLDER_ID)' };
  const root = getClientJobsRootFolderId();
  if (root) return { id: root, label: 'Client Jobs root (GOOGLE_DRIVE_CLIENT_JOBS_ROOT_ID)' };
  const hub = getCustomerHubFolderId();
  if (hub) return { id: hub, label: 'Customer hub (GOOGLE_DRIVE_CUSTOMER_HUB_FOLDER_ID)' };
  return null;
}

/**
 * OAuth client for shop Drive (job template, Active/Completed/Archive).
 * Ticket Gmail is for mail, not Drive — contact@ can have Drive scope and still 404 shared-drive folders.
 * Tries GOOGLE_DRIVE_GMAIL first, then every connected mailbox until one can open the probe folder.
 */
export async function getAuthForGoogleDrive(opts?: {
  probeFolderId?: string | null;
  probeLabel?: string;
}): Promise<GoogleDriveAuth> {
  const connections = await prisma.gmailConnection.findMany({
    orderBy: { googleEmail: 'asc' },
    select: { id: true, googleEmail: true },
  });
  if (connections.length === 0) {
    throw new Error('Gmail is not connected. Use Connect Gmail in Settings.');
  }

  const probe = opts?.probeFolderId
    ? { id: opts.probeFolderId, label: opts.probeLabel ?? 'Drive folder' }
    : defaultProbeFolder();

  const pinned = pinnedDriveMailbox();
  const ordered = [...connections].sort((a, b) => {
    const score = (email: string) => (pinned && email.toLowerCase() === pinned ? 0 : 1);
    const d = score(a.googleEmail) - score(b.googleEmail);
    return d !== 0 ? d : a.googleEmail.localeCompare(b.googleEmail);
  });

  const failures: string[] = [];
  for (const conn of ordered) {
    try {
      const auth = await getGmailOAuth2ClientForConnection(conn.id);
      if (probe) {
        await assertDriveFolderAccessible(auth, probe.id, probe.label);
      }
      return { auth, mailbox: conn.googleEmail };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${conn.googleEmail}: ${msg}`);
    }
  }

  if (probe) {
    throw new Error(
      `No connected Google account can open ${probe.label}. Tried ${failures.join(' · ')}. Share that folder with a connected mailbox, or set GOOGLE_DRIVE_GMAIL to one that is in the shared drive.`,
    );
  }
  throw new Error(failures[0] ?? 'Gmail is not connected. Use Connect Gmail in Settings.');
}
