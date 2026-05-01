import { NextResponse } from 'next/server';
import { z } from 'zod';
import { wantsJsonResponse } from '@/lib/http/wants-json-response';
import { saveJobWrapUp } from '@/lib/domain/sync';

const bodySchema = z.object({
  notes: z.string().min(1, 'Describe what happened.').max(12000),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wantsJson = wantsJsonResponse(req);

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    parsed = bodySchema.parse(raw);
  } catch {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    return NextResponse.redirect(new URL('/dashboard/tickets?job_error=wrap_up', req.url));
  }

  try {
    await saveJobWrapUp(id, parsed.notes);
  } catch {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 400 });
    return NextResponse.redirect(new URL('/dashboard/tickets?job_error=wrap_up', req.url));
  }

  if (wantsJson) return NextResponse.json({ ok: true });
  return NextResponse.redirect(new URL(`/dashboard/jobs/${id}?wrap_up=1`, req.url));
}
