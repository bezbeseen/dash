import { NextResponse } from 'next/server';
import { ProductionStatus } from '@prisma/client';
import { updateProductionStatus } from '@/lib/domain/sync';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await updateProductionStatus(id, ProductionStatus.IN_PROGRESS, 'job.started', 'Production started.');
  } catch {
    return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/tickets?job_error=blocked'));
  }
  return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/tickets'));
}
