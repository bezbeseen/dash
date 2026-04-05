import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/** Wipes local Job + ActivityLog rows. Dev-only — keeps OAuth tokens & webhook events. */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  await prisma.activityLog.deleteMany();
  await prisma.job.deleteMany();

  return NextResponse.redirect(new URL('/dashboard/tickets?cleared=1', baseUrl()));
}
