import { NextResponse } from 'next/server';
import { transformOccurrences } from '@/lib/transform/occurrences';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await transformOccurrences();
    return NextResponse.json({ ok: true, processed: result.processed });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
