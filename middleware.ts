import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_API_PREFIXES = [
  '/api/auth/', // NextAuth routes
  '/api/integrations/quickbooks/webhook', // server-to-server
];

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only enforce on matchers below; still keep this guard for safety.
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') return NextResponse.next();

  if (pathname.startsWith('/api/') && isPublicApiPath(pathname)) return NextResponse.next();

  const token = await getToken({ req });
  if (token) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/'],
};

