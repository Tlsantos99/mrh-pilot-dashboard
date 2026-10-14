import { NextRequest, NextResponse } from 'next/server';

const BLOCKED_HOSTS = ['mrh-pilot-dashboard.vercel.app'];

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  if (BLOCKED_HOSTS.some(h => host === h || host.startsWith(h))) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
