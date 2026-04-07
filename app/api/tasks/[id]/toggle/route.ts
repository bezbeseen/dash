import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSessionEmail } from '@/lib/auth-session';
import { postDashboardFormRedirect } from '@/lib/http/post-action-redirect';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  await requireSessionEmail();
  const { id } = await params;
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    const to = postDashboardFormRedirect(req, { jobIdFallback: null });
    to.searchParams.set('task_error', 'not_found');
    return NextResponse.redirect(to);
  }

  const nextStatus = existing.status === 'DONE' ? 'OPEN' : 'DONE';
  await prisma.task.update({ where: { id }, data: { status: nextStatus } });
  return NextResponse.redirect(
    postDashboardFormRedirect(req, { jobIdFallback: existing.jobId }),
  );
}

