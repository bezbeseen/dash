import { NextResponse } from 'next/server';
import { ArchiveReason } from '@prisma/client';
import { z } from 'zod';
import { archiveJob, saveJobWrapUp } from '@/lib/domain/sync';
import { postActionRedirect } from '@/lib/http/post-action-redirect';
import { wantsJsonResponse } from '@/lib/http/wants-json-response';

const doneJsonSchema = z.object({
  prodWrapUpNotes: z.string().min(1, 'Describe what happened.').max(12000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wantsJson = wantsJsonResponse(req);
  let wrapNotes: string | undefined;

  if (wantsJson) {
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
    }
    const p = doneJsonSchema.safeParse(raw ?? {});
    if (!p.success) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }
    wrapNotes = p.data.prodWrapUpNotes?.trim();
  }

  try {
    if (wrapNotes) await saveJobWrapUp(id, wrapNotes);
    await archiveJob(id, ArchiveReason.DONE, 'Marked Done — ticket removed from the board.');
  } catch {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'archive_failed' }, { status: 400 });
    return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/tickets?job_error=archive'));
  }

  if (wantsJson) return NextResponse.json({ ok: true });
  return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/tickets'));
}
