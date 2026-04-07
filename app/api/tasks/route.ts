import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSessionEmail } from '@/lib/auth-session';
import { postDashboardFormRedirect } from '@/lib/http/post-action-redirect';

export async function GET(req: Request) {
  await requireSessionEmail();
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const jobId = url.searchParams.get('jobId');

  const where: { status?: 'OPEN' | 'DONE'; jobId?: string | null } = {};
  if (status === 'OPEN' || status === 'DONE') where.status = status;
  if (jobId === 'null') where.jobId = null;
  else if (jobId) where.jobId = jobId;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 200,
  });
  return NextResponse.json({ ok: true, tasks });
}

export async function POST(req: Request) {
  const email = await requireSessionEmail();
  const form = await req.formData();
  const titleRaw = String(form.get('title') ?? '').trim();
  const notesRaw = String(form.get('notes') ?? '').trim();
  const jobIdRaw = String(form.get('jobId') ?? '').trim();
  const dueAtRaw = String(form.get('dueAt') ?? '').trim();
  const jobId = jobIdRaw || null;

  if (!titleRaw) {
    const to = postDashboardFormRedirect(req, { fallbackPath: '/dashboard/tasks', jobIdFallback: jobId });
    to.searchParams.set('task_error', 'title_required');
    return NextResponse.redirect(to);
  }

  const dueAt = dueAtRaw ? new Date(dueAtRaw) : null;
  const dueAtValid = dueAt ? !Number.isNaN(dueAt.getTime()) : true;
  if (!dueAtValid) {
    const to = postDashboardFormRedirect(req, { fallbackPath: '/dashboard/tasks', jobIdFallback: jobId });
    to.searchParams.set('task_error', 'dueAt_invalid');
    return NextResponse.redirect(to);
  }

  await prisma.task.create({
    data: {
      title: titleRaw,
      notes: notesRaw || null,
      jobId,
      dueAt: dueAt ?? null,
      createdByEmail: email,
    },
  });

  const to = postDashboardFormRedirect(req, { fallbackPath: '/dashboard/tasks', jobIdFallback: jobId });
  return NextResponse.redirect(to);
}

