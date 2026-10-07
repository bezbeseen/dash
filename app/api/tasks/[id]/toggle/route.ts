import { NextResponse } from 'next/server';
import { TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { requireSessionEmail } from '@/lib/auth-session';
import { postDashboardFormRedirect } from '@/lib/http/post-action-redirect';
import { wantsJsonResponse } from '@/lib/http/wants-json-response';

type Params = { params: Promise<{ id: string }> };

/** JSON callers may name the status they want so a stale list cannot reopen a finished task. */
const jsonBodySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
});

export async function POST(req: Request, { params }: Params) {
  await requireSessionEmail();
  const { id } = await params;
  const wantsJson = wantsJsonResponse(req);

  let requested: TaskStatus | undefined;
  if (wantsJson) {
    const parsed = jsonBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }
    requested = parsed.data.status;
  }

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    const to = postDashboardFormRedirect(req, { jobIdFallback: null });
    to.searchParams.set('task_error', 'not_found');
    return NextResponse.redirect(to);
  }

  const nextStatus = requested ?? (existing.status === 'DONE' ? 'OPEN' : 'DONE');
  if (nextStatus !== existing.status) {
    await prisma.task.update({ where: { id }, data: { status: nextStatus } });
  }
  if (wantsJson) return NextResponse.json({ ok: true, status: nextStatus });
  return NextResponse.redirect(
    postDashboardFormRedirect(req, { jobIdFallback: existing.jobId }),
  );
}

