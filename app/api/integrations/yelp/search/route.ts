import { NextRequest, NextResponse } from 'next/server';
import { getYelpApiKey, yelpBusinessSearch } from '@/lib/yelp/fusion';

/**
 * Server proxy for Yelp Fusion business search. Requires YELP_API_KEY.
 * Example: GET /api/integrations/yelp/search?term=pizza&location=Austin+TX
 */
export async function GET(req: NextRequest) {
  if (!getYelpApiKey()) {
    return NextResponse.json({ error: 'YELP_API_KEY not configured' }, { status: 503 });
  }
  const term = req.nextUrl.searchParams.get('term')?.trim();
  if (!term) {
    return NextResponse.json({ error: 'Missing query param: term' }, { status: 400 });
  }
  const location = req.nextUrl.searchParams.get('location')?.trim();
  try {
    const data = await yelpBusinessSearch(term, location);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'search_failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
