import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { postActionRedirect } from '@/lib/http/post-action-redirect';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id: jobId, linkId } = await params;
  const deleted = await prisma.linkedEmail.deleteMany({
    where: { id: linkId, jobId },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }
  return NextResponse.redirect(postActionRedirect(req, jobId, `/dashboard/jobs/${jobId}`));
}
