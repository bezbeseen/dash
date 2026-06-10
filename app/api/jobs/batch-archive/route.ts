import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ArchiveReason } from '@prisma/client';
import { z } from 'zod';
import { archiveJob } from '@/lib/domain/sync';
import { prisma } from '@/lib/db/prisma';

const bodySchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1).max(100),
  reason: z.enum(['DISMISSED', 'LOST', 'DONE']),
});

function archiveMessage(reason: ArchiveReason): string {
  switch (reason) {
    case ArchiveReason.DISMISSED:
      return 'Dismissed — thin / low-intent pre-quote lead.';
    case ArchiveReason.LOST:
      return 'Marked Lost — ticket removed from the board.';
    case ArchiveReason.DONE:
      return 'Marked Done — ticket removed from the board.';
    default:
      return 'Archived off the board.';
  }
}

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

  const reason = parsed.data.reason as ArchiveReason;
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

    try {
      await archiveJob(id, reason, archiveMessage(reason));
      succeeded.push(id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'archive_failed';
      failed.push({ id, error: message });
    }
  }

  if (succeeded.length > 0) {
    revalidatePath('/dashboard/tickets');
    revalidatePath('/dashboard/prequoted');
    revalidatePath('/dashboard/done');
    revalidatePath('/dashboard');
  }

  return NextResponse.json({
    ok: true as const,
    succeeded,
    failed,
  });
}
