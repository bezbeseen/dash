import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { requireSessionEmail } from '@/lib/auth-session';
import { isAllowedAssigneeEmail } from '@/lib/todo/assignee-options';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  assigneeEmail: z.string().trim().max(320).nullable(),
});

export async function POST(req: Request, { params }: Params) {
  await requireSessionEmail();
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const assigneeEmail = parsed.data.assigneeEmail ? parsed.data.assigneeEmail.toLowerCase() : null;
  if (!isAllowedAssigneeEmail(assigneeEmail)) {
    return NextResponse.json({ ok: false, error: 'assignee_invalid' }, { status: 400 });
  }

  const existing = await prisma.task.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  await prisma.task.update({ where: { id }, data: { assigneeEmail } });
  return NextResponse.json({ ok: true, assigneeEmail });
}
