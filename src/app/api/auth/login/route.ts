import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function sign(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    const expectedUsername = process.env.DASHBOARD_USERNAME;
    const expectedPassword = process.env.DASHBOARD_PASSWORD;
    const secret = process.env.DASHBOARD_SECRET;

    if (!expectedUsername || !expectedPassword || !secret) {
      return NextResponse.json({ error: 'Servidor não configurado' }, { status: 500 });
    }

    if (username !== expectedUsername || password !== expectedPassword) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const token = sign(`${username}:${secret}`, secret);

    const response = NextResponse.json({ ok: true });
    response.cookies.set('mrh_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
