import { NextResponse } from 'next/server';
import { ArchiveReason } from '@prisma/client';
import { z } from 'zod';
import { archiveJob } from '@/lib/domain/sync';
import { jobNeedsWrapUpReminder } from '@/lib/domain/production-workflow';
import { prisma } from '@/lib/db/prisma';

const bodySchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * Marks several tickets done (archived) in one request. Skips jobs that need wrap-up first
 * (same rule as the per-ticket Done control when paid in full).
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false as const, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false as const, error: 'invalid_body' }, { status: 400 });
  }

  const jobIds = [...new Set(parsed.data.jobIds)];
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of jobIds) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      failed.push({ id, error: 'not_found' });
      continue;
    }
    if (job.archivedAt != null) {
      failed.push({ id, error: 'already_archived' });
      continue;
    }
    if (jobNeedsWrapUpReminder(job, null)) {
      failed.push({ id, error: 'wrap_up_required' });
      continue;
    }

    try {
      await archiveJob(id, ArchiveReason.DONE, 'Marked Done — ticket removed from the board.');
      succeeded.push(id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'archive_failed';
      failed.push({ id, error: message });
    }
  }

  return NextResponse.json({
    ok: true as const,
    succeeded,
    failed,
  });
}
