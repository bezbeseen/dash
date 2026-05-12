import { NextResponse } from 'next/server';
import { restoreJobToBoard } from '@/lib/domain/sync';
import { wantsJsonResponse } from '@/lib/http/wants-json-response';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wantsJson = wantsJsonResponse(req);

  try {
    await restoreJobToBoard(id);
  } catch {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'restore_failed' }, { status: 400 });
    const u = new URL(req.url);
    return NextResponse.redirect(
      new URL(`/dashboard/jobs/${encodeURIComponent(id)}?job_error=restore`, `${u.protocol}//${u.host}`),
    );
  }

  if (wantsJson) return NextResponse.json({ ok: true });
  const u = new URL(req.url);
  return NextResponse.redirect(
    new URL(`/dashboard/jobs/${encodeURIComponent(id)}?restored=1`, `${u.protocol}//${u.host}`),
  );
}
