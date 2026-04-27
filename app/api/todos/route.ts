import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSessionEmail } from '@/lib/auth-session';
import { postDashboardFormRedirect } from '@/lib/http/post-action-redirect';
import { isAllowedAssigneeEmail } from '@/lib/todo/assignee-options';

export async function POST(req: Request) {
  const email = await requireSessionEmail();
  const form = await req.formData();
  const titleRaw = String(form.get('title') ?? '').trim();
  const notesRaw = String(form.get('notes') ?? '').trim();
  const dueAtRaw = String(form.get('dueAt') ?? '').trim();
  const assigneeRaw = String(form.get('assigneeEmail') ?? '').trim();

  const redirectWith = (code: string) => {
    const to = postDashboardFormRedirect(req, { fallbackPath: '/dashboard/todos' });
    to.searchParams.set('todo_error', code);
    return NextResponse.redirect(to);
  };

  if (!titleRaw) {
    return redirectWith('title_required');
  }

  const assigneeEmail = assigneeRaw ? assigneeRaw.toLowerCase() : null;
  if (!isAllowedAssigneeEmail(assigneeEmail)) {
    return redirectWith('assignee_invalid');
  }

  const dueAt = dueAtRaw ? new Date(dueAtRaw) : null;
  if (dueAtRaw && (dueAt == null || Number.isNaN(dueAt.getTime()))) {
    return redirectWith('dueAt_invalid');
  }

  await prisma.todo.create({
    data: {
      title: titleRaw,
      notes: notesRaw || null,
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
      assigneeEmail,
      createdByEmail: email,
    },
  });

  return NextResponse.redirect(postDashboardFormRedirect(req, { fallbackPath: '/dashboard/todos' }));
}
