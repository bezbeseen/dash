import { NextResponse } from 'next/server';
import { EventSource, GmailLinkSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  applyThreadLink,
  findGmailThreadCandidates,
  JOB_MATCH_SELECT,
  linkIsProtected,
  loadGmailMailboxes,
  matchGmailThreadForJob,
} from '@/lib/gmail/find-thread-for-job';
import { parseStoredThreadSuggestions, type ScoredThreadCandidate } from '@/lib/gmail/thread-match';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Bounded Gmail searches plus one thread sync; matches the other Gmail routes' budget. */
export const maxDuration = 60;

/** Dry-run preview for one ticket: shows the searches and the ranking, writes nothing. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: JOB_MATCH_SELECT });
  if (!job) {
    return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
  }

  try {
    const mailboxes = await loadGmailMailboxes();
    const run = await findGmailThreadCandidates(job, mailboxes);
    return NextResponse.json({
      ok: true,
      jobId,
      protectedLink: linkIsProtected(job),
      profile: run.profile,
      action: run.action,
      reason: run.reason,
      searched: run.searched,
      threadsInspected: run.inspected.length,
      errors: run.errors,
      wouldAttach: run.best && run.action === 'auto_link' ? run.best.threadId : null,
      candidates: run.inspected,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'match_failed';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

/**
 * With `threadId` in the form: accepts a suggestion the matcher already ranked.
 * Without it: runs the matcher and attaches only an unambiguous address match.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: JOB_MATCH_SELECT });
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const redirect = (key: string, value: string) => {
    const u = postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`);
    u.searchParams.set(key, value);
    u.hash = 'ticket-gmail';
    return NextResponse.redirect(u);
  };

  const form = await req.formData();
  const chosenThreadId = String(form.get('threadId') ?? '').trim();

  try {
    if (chosenThreadId) {
      const candidate = await candidateFromSuggestionLog(jobId, chosenThreadId);
      if (!candidate) {
        return redirect('gmail_match_error', 'That suggestion has expired. Run Find email thread again.');
      }
      const linked = await applyThreadLink({
        jobId,
        candidate,
        source: GmailLinkSource.CONFIRMED,
        eventSource: EventSource.APP,
        sync: true,
      });
      return redirect(
        'gmail_match',
        linked.syncError ? `confirmed_sync_failed:${linked.syncError.slice(0, 200)}` : 'confirmed',
      );
    }

    const { outcome } = await matchGmailThreadForJob({
      jobId,
      eventSource: EventSource.APP,
      sync: true,
    });

    if (outcome.status === 'linked') {
      return redirect(
        'gmail_match',
        outcome.syncError ? `linked_sync_failed:${outcome.syncError.slice(0, 200)}` : 'linked',
      );
    }
    if (outcome.status === 'suggested') {
      return redirect('gmail_match', `suggested:${outcome.suggestions.length}`);
    }
    if (outcome.status === 'skipped') {
      return redirect('gmail_match', `skipped:${outcome.reason.slice(0, 200)}`);
    }
    return redirect('gmail_match', `none:${outcome.reason.slice(0, 200)}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'match_failed';
    return redirect('gmail_match_error', message.slice(0, 300));
  }
}

/**
 * Suggestions live in ActivityLog metadata rather than a table of their own, so accepting one
 * means re-reading the most recent suggestion entry for this ticket.
 */
async function candidateFromSuggestionLog(
  jobId: string,
  threadId: string,
): Promise<ScoredThreadCandidate | null> {
  const log = await prisma.activityLog.findFirst({
    where: { jobId, eventName: 'gmail.thread_suggested' },
    orderBy: { createdAt: 'desc' },
  });
  if (!log) return null;

  const stored = parseStoredThreadSuggestions(log.metadata).find((s) => s.threadId === threadId);
  if (!stored) return null;

  return {
    threadId: stored.threadId,
    gmailConnectionId: stored.gmailConnectionId,
    mailboxEmail: stored.mailboxEmail,
    subject: stored.subject,
    snippet: '',
    participants: stored.counterparties.map((address) => ({ address, name: '' })),
    messageCount: stored.messageCount,
    lastMessageAt: stored.lastMessageAt,
    foundBy: stored.signals[0] ?? 'customer_name',
    foundByLabel: 'accepted suggestion',
    score: stored.score,
    signals: stored.signals,
    reasons: stored.reasons,
    counterparties: stored.counterparties,
  };
}
