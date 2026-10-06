import { NextResponse } from 'next/server';
import { runAutoSync } from '@/lib/domain/auto-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called every few minutes by the open dashboard (components/auto-sync.tsx). Pulls QuickBooks
 * changes and new Yelp lead emails; returns `ran: false` when another tab synced moments ago.
 */
export async function POST() {
  try {
    return NextResponse.json(await runAutoSync());
  } catch (e) {
    const error = e instanceof Error ? e.message : 'auto_sync_failed';
    return NextResponse.json({ ran: false, changed: false, error }, { status: 500 });
  }
}
