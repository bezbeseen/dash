import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendReviewRequestEmailManual } from '@/lib/email/review-request-after-done';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ ok: false as const, error: 'Ticket not found.' }, { status: 404 });
  }

  const result = await sendReviewRequestEmailManual(job);
  if (!result.ok) {
    return NextResponse.json({ ok: false as const, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true as const, to: result.to });
}
