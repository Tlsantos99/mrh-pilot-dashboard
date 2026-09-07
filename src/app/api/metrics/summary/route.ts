import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();
    const [{ data: kpis }, { data: refresh }] = await Promise.all([
      supabase.from('v_summary_kpis').select('*').single(),
      supabase.from('upload_history').select('file_type, upload_timestamp')
        .eq('status', 'success')
        .order('upload_timestamp', { ascending: false })
        .limit(10),
    ]);

    // Build last update per file type
    const lastUpdate: Record<string, string> = {};
    for (const r of refresh ?? []) {
      if (!lastUpdate[r.file_type]) lastUpdate[r.file_type] = r.upload_timestamp;
    }

    return NextResponse.json({ kpis, lastUpdate });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
