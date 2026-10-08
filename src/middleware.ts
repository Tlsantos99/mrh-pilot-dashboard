import { NextResponse } from 'next/server';

export function middleware() {
  return new NextResponse(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Acesso Indisponível</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f1f5f9}div{text-align:center;max-width:400px;padding:2rem}h1{color:#00305E;font-size:1.5rem;margin-bottom:1rem}p{color:#6b7280;font-size:0.95rem;line-height:1.6}</style></head><body><div><h1>Acesso Temporariamente Indisponível</h1><p>Este portal encontra-se temporariamente indisponível. Por favor, tente mais tarde.</p></div></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
