import { NextResponse } from 'next/server';
import { EventSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { normalizeOptionalLinkUrl } from '@/lib/validation/linked-email';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const form = await req.formData();
  const subject = String(form.get('subject') ?? '').trim() || null;
  const fromAddr = String(form.get('fromAddr') ?? '').trim() || null;
  const toAddr = String(form.get('toAddr') ?? '').trim() || null;
  const linkUrl = normalizeOptionalLinkUrl(String(form.get('linkUrl') ?? ''));
  const notes = String(form.get('notes') ?? '').trim() || null;
  const sentAtRaw = String(form.get('sentAt') ?? '').trim();
  let sentAt: Date | null = null;
  if (sentAtRaw) {
    const d = new Date(sentAtRaw);
    if (!Number.isNaN(d.getTime())) sentAt = d;
  }

  if (!subject && !fromAddr && !linkUrl && !notes) {
    const u = postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`);
    u.searchParams.set('email_error', 'empty');
    return NextResponse.redirect(u);
  }

  await prisma.linkedEmail.create({
    data: {
      jobId,
      subject,
      fromAddr,
      toAddr,
      sentAt,
      linkUrl,
      notes,
    },
  });

  await prisma.activityLog.create({
    data: {
      jobId,
      source: EventSource.APP,
      eventName: 'email.seed_linked',
      message: subject ? `Seed email linked: ${subject}` : 'Linked a Gmail seed to this ticket.',
    },
  });

  return NextResponse.redirect(postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`));
}
