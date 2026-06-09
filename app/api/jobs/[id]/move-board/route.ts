import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { moveJobToDashboardColumn } from '@/lib/domain/move-board-column';
import { wantsJsonResponse } from '@/lib/http/wants-json-response';

const bodySchema = z.object({
  column: z.enum(['QUOTED', 'APPROVED', 'PRODUCTION', 'READY_INVOICED', 'DELIVERED', 'PAID']),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wantsJson = wantsJsonResponse(req);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
    return NextResponse.redirect(new URL('/dashboard/tickets?job_error=blocked', req.url));
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    return NextResponse.redirect(new URL('/dashboard/tickets?job_error=blocked', req.url));
  }

  const result = await moveJobToDashboardColumn(id, parsed.data.column);

  if (!result.ok) {
    if (result.error === 'already') {
      if (wantsJson) return NextResponse.json({ ok: true, boardStatus: null, unchanged: true });
      return NextResponse.redirect(new URL('/dashboard/tickets', req.url));
    }
    const err =
      result.error === 'paid'
        ? 'paid'
        : result.error === 'archived'
          ? 'archive'
          : 'blocked';
    if (wantsJson) return NextResponse.json({ ok: false, error: err }, { status: 400 });
    return NextResponse.redirect(new URL(`/dashboard/tickets?job_error=${err}`, req.url));
  }

  revalidatePath('/dashboard/tickets');
  revalidatePath('/dashboard/prequoted');
  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/jobs/${id}`);

  if (wantsJson) {
    return NextResponse.json({ ok: true, boardStatus: result.boardStatus });
  }
  return NextResponse.redirect(new URL('/dashboard/tickets', req.url));
}
