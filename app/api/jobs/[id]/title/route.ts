import { NextResponse } from 'next/server';
import { EventSource } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { wantsJsonResponse } from '@/lib/http/wants-json-response';

const bodySchema = z.object({
  projectName: z.string().trim().min(1).max(512),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wantsJson = wantsJsonResponse(req);

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    return NextResponse.redirect(new URL(`/dashboard/jobs/${id}?job_error=title`, req.url));
  }

  const current = await prisma.job.findUnique({
    where: { id },
    select: { id: true, projectName: true },
  });
  if (!current) {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    return NextResponse.redirect(new URL('/dashboard/tickets?job_error=not_found', req.url));
  }

  const nextName = parsed.projectName;
  if (nextName === current.projectName.trim()) {
    if (wantsJson) return NextResponse.json({ ok: true, projectName: current.projectName });
    return NextResponse.redirect(new URL(`/dashboard/jobs/${id}`, req.url));
  }

  await prisma.job.update({
    where: { id },
    data: { projectName: nextName },
  });
  await prisma.activityLog.create({
    data: {
      jobId: id,
      source: EventSource.APP,
      eventName: 'job.title_updated',
      message: `Title changed to "${nextName}".`,
      metadata: { previous: current.projectName, projectName: nextName },
    },
  });

  if (wantsJson) return NextResponse.json({ ok: true, projectName: nextName });
  return NextResponse.redirect(new URL(`/dashboard/jobs/${id}`, req.url));
}
