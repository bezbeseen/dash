import { NextResponse } from 'next/server';
import { getYelpApiKey, yelpBusinessById } from '@/lib/yelp/fusion';

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/integrations/yelp/business/[id] - Yelp Fusion business details. */
export async function GET(_req: Request, { params }: RouteParams) {
  if (!getYelpApiKey()) {
    return NextResponse.json({ error: 'YELP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }
  try {
    const data = await yelpBusinessById(id.trim());
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'lookup_failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
