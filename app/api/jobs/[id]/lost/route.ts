import { ArchiveReason } from '@prisma/client';
import { archiveJob } from '@/lib/domain/sync';
import { redirectAfterJobAction } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await archiveJob(id, ArchiveReason.LOST, 'Marked Lost — ticket removed from the board.');
  } catch {
    return redirectAfterJobAction(req, id, '/dashboard/tickets?job_error=archive');
  }
  return redirectAfterJobAction(req, id, '/dashboard/tickets');
}
