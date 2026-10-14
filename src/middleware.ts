import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const password = process.env.SITE_PASSWORD;

  if (password && auth) {
    const [scheme, encoded] = auth.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const [, pwd] = decoded.split(':');
      if (pwd === password) return NextResponse.next();
    }
  }

  return new NextResponse('Acesso restrito', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="MRH Pilot Dashboard"',
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
