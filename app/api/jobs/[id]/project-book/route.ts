import { NextResponse } from 'next/server';
import { requireSessionEmail } from '@/lib/auth-session';
import { isProjectBookPayload } from '@/lib/domain/project-book';
import {
  loadProjectBookForJob,
  makeProjectBookForJob,
  saveProjectBookForJob,
} from '@/lib/drive/project-book-file';
import { wantsJsonResponse } from '@/lib/http/wants-json-response';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function editorUrl(req: Request, jobId: string): URL {
  const incoming = new URL(req.url);
  return new URL(`/dashboard/project-summary?job=${encodeURIComponent(jobId)}`, `${incoming.protocol}//${incoming.host}`);
}

function ticketErrorUrl(req: Request, jobId: string, error: string): URL {
  const incoming = new URL(req.url);
  const u = new URL(`/dashboard/jobs/${jobId}`, `${incoming.protocol}//${incoming.host}`);
  u.searchParams.set('drive_error', error);
  return u;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSessionEmail();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const result = await loadProjectBookForJob(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, ...result.data, jobId: id });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSessionEmail();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!isProjectBookPayload(body)) {
    return NextResponse.json({ error: 'invalid_project' }, { status: 400 });
  }
  const result = await saveProjectBookForJob(id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, ...result.data, jobId: id });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSessionEmail();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const wantsJson = wantsJsonResponse(req);
  const result = await makeProjectBookForJob(id);
  if (!result.ok) {
    if (wantsJson) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.redirect(ticketErrorUrl(req, id, result.error), 303);
  }
  const dest = editorUrl(req, id);
  if (wantsJson) return NextResponse.json({ ok: true, editorUrl: dest.pathname + dest.search, ...result.data });
  return NextResponse.redirect(dest, 303);
}
