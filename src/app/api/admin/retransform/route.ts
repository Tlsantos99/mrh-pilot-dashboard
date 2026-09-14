import { NextRequest, NextResponse } from 'next/server';
import { transformOccurrences } from '@/lib/transform/occurrences';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    let uploadId: string | undefined;
    try {
      const body = await req.json();
      uploadId = body?.uploadId ?? undefined;
    } catch {
      // no body or invalid JSON — process all
    }
    const result = await transformOccurrences(uploadId);
    return NextResponse.json({ ok: true, processed: result.processed, skipped: result.skipped ?? 0 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
