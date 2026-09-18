import { collectGmailApiIdCandidates, parseGmailThreadId } from '@/lib/gmail/parse-thread-id';

export type GmailThreadJobHit = {
  id: string;
  archivedAt: Date | null;
  updatedAt: Date;
  gmailConnectionId: string | null;
  gmailThreadId: string | null;
};

/** Thread ids to match against Job.gmailThreadId (API hex, parse, and stored URL fragments). */
export function gmailThreadIdCandidates(resolvedThreadId: string, raw: string): string[] {
  const parsed = parseGmailThreadId(raw);
  const collected = [...collectGmailApiIdCandidates(resolvedThreadId), ...collectGmailApiIdCandidates(raw)];
  const ids = [...new Set([resolvedThreadId, raw, parsed, ...collected].filter((v): v is string => Boolean(v?.trim())))];
  return ids.map((s) => s.trim()).filter(Boolean);
}

export function jobRowMatchesGmailThread(
  storedThreadId: string | null | undefined,
  candidates: string[],
): boolean {
  const stored = storedThreadId?.trim();
  if (!stored || candidates.length === 0) return false;
  if (candidates.includes(stored)) return true;
  for (const c of candidates) {
    if (c.length >= 10 && stored.includes(c)) return true;
    if (stored.length >= 10 && c.includes(stored)) return true;
  }
  return false;
}

/** Prefer an on-board ticket, then the same mailbox, then most recently updated. Includes dismissed rows. */
export function pickJobForGmailThread(
  jobs: GmailThreadJobHit[],
  opts?: { preferredConnectionId?: string | null },
): GmailThreadJobHit | null {
  if (jobs.length === 0) return null;
  const preferred = opts?.preferredConnectionId ?? null;
  return [...jobs].sort((a, b) => {
    const aOn = a.archivedAt == null ? 1 : 0;
    const bOn = b.archivedAt == null ? 1 : 0;
    if (aOn !== bOn) return bOn - aOn;
    const aMail = preferred && a.gmailConnectionId === preferred ? 1 : 0;
    const bMail = preferred && b.gmailConnectionId === preferred ? 1 : 0;
    if (aMail !== bMail) return bMail - aMail;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0]!;
}
