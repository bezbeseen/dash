import { NextRequest, NextResponse } from 'next/server';
import { GMAIL_OAUTH_CALLBACK_PATH } from '@/lib/gmail/config';

/** Visiting `/api/integrations/gmail` lists OAuth URLs (helps when people guess the wrong path). */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const callback = `${origin}${GMAIL_OAUTH_CALLBACK_PATH}`;
  return NextResponse.json({
    ok: true,
    hint: 'The Gmail callback is an API route, not a dashboard page. Register the callback URL in Google Cloud exactly as shown.',
    connect: `${origin}/api/integrations/gmail/connect`,
    callback,
    pathMustBe: GMAIL_OAUTH_CALLBACK_PATH,
  });
}
