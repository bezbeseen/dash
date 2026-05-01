import { NextResponse } from 'next/server';
import { ProductionStatus } from '@prisma/client';
import { z } from 'zod';
import { updateProductionStatus } from '@/lib/domain/sync';
import { postActionRedirect } from '@/lib/http/post-action-redirect';
import { wantsJsonResponse } from '@/lib/http/wants-json-response';

const optionalNonNeg = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  })
  .refine((n) => n === null || n >= 0, 'Must be a non-negative number.');

const jsonBodySchema = z.object({
  prodPlanLaborHours: optionalNonNeg,
  prodPlanMaterials: z.union([z.string(), z.null(), z.undefined()]).transform((s) => (s == null ? null : String(s))),
  prodPlanClientCommHours: optionalNonNeg,
  prodPlanDesignHours: optionalNonNeg,
});

function parseProductionPlan(body: unknown): z.infer<typeof jsonBodySchema> | null {
  const r = jsonBodySchema.safeParse(body ?? {});
  return r.success ? r.data : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wantsJson = wantsJsonResponse(req);
  let productionPlan: z.infer<typeof jsonBodySchema> | null = null;

  if (wantsJson) {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
    }
    productionPlan = parseProductionPlan(raw);
    if (productionPlan === null) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }
  }

  try {
    await updateProductionStatus(id, ProductionStatus.IN_PROGRESS, 'job.started', 'Production started.', {
      ...(wantsJson ? { productionPlan } : {}),
    });
  } catch {
    if (wantsJson) return NextResponse.json({ ok: false, error: 'blocked' }, { status: 400 });
    return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/tickets?job_error=blocked'));
  }

  if (wantsJson) return NextResponse.json({ ok: true });
  return NextResponse.redirect(postActionRedirect(req, id, '/dashboard/tickets'));
}
