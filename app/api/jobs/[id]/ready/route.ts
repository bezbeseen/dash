import { ProductionStatus } from '@prisma/client';
import { updateProductionStatus } from '@/lib/domain/sync';
import { redirectAfterJobAction } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await updateProductionStatus(id, ProductionStatus.READY, 'job.ready', 'Job marked ready.');
  } catch {
    return redirectAfterJobAction(req, id, '/dashboard/tickets?job_error=blocked');
  }
  return redirectAfterJobAction(req, id, '/dashboard/tickets');
}
