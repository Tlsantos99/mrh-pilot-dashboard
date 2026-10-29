import { NextRequest, NextResponse } from 'next/server';
import { transformOccurrences } from '@/lib/transform/occurrences';
import { createServerClient } from '@/lib/supabase/server';

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

    if (uploadId) {
      const result = await transformOccurrences(uploadId);
      return NextResponse.json({ ok: true, processed: result.processed, skipped: result.skipped ?? 0 });
    }

    // Full retransform: iterate per global upload_id to avoid OFFSET timeout on 300K+ rows
    const supabase = createServerClient();
    const { data: uploads, error: uploadsErr } = await supabase
      .from('upload_history')
      .select('upload_id, upload_timestamp')
      .eq('file_type', 'global')
      .eq('status', 'success')
      .order('upload_timestamp', { ascending: true });

    if (uploadsErr) throw new Error(uploadsErr.message ?? JSON.stringify(uploadsErr));

    let totalProcessed = 0;
    let totalSkipped = 0;
    const errors: string[] = [];
    for (const u of uploads ?? []) {
      try {
        const result = await transformOccurrences(u.upload_id);
        totalProcessed += result.processed;
        totalSkipped += (result.skipped ?? 0);
      } catch (e) {
        errors.push(`${u.upload_id}: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      processed: totalProcessed,
      skipped: totalSkipped,
      uploads: (uploads ?? []).length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : JSON.stringify(err) }, { status: 500 });
  }
}
