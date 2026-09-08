import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readFilters, applyFilters } from '@/lib/utils/filters';

export const dynamic = 'force-dynamic';

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}

export async function GET(req: NextRequest) {
  try {
    const filters = readFilters(new URL(req.url).searchParams);
    const supabase = createServerClient();

    let q = supabase
      .from('occurrences')
      .select('asf_aggregator,wave_number,wave_name,channel,has_expertise,lt_total,closing_date')
      .eq('eligible_for_pilot', true)
      .eq('is_event', false);
    q = applyFilters(q, filters);

    const { data: rows, error } = await q;
    if (error) throw error;

    type Acc = {
      asf_aggregator: string; wave_number: number; wave_name: string;
      total: number; novo: number; antigo: number; email_outro: number; gd: number; lt_totals: number[];
    };
    const map = new Map<string, Acc>();
    for (const r of rows ?? []) {
      if (!r.asf_aggregator) continue;
      const key = r.asf_aggregator as string;
      if (!map.has(key)) map.set(key, {
        asf_aggregator: key, wave_number: r.wave_number, wave_name: r.wave_name,
        total: 0, novo: 0, antigo: 0, email_outro: 0, gd: 0, lt_totals: [],
      });
      const w = map.get(key)!;
      w.total++;
      if (r.channel === 'Formulário Novo') w.novo++;
      else if (r.channel === 'Formulário Antigo') w.antigo++;
      else w.email_outro++;
      if (!r.has_expertise) w.gd++;
      if (r.closing_date && r.lt_total != null) w.lt_totals.push(r.lt_total as number);
    }

    const data = Array.from(map.values())
      .sort((a, b) => (a.wave_number ?? 99) - (b.wave_number ?? 99) || a.asf_aggregator.localeCompare(b.asf_aggregator))
      .map(w => ({
        agent_code: w.asf_aggregator,
        agent_name: w.asf_aggregator,
        wave_number: w.wave_number,
        wave_name: w.wave_name,
        total: w.total,
        novo: w.novo,
        antigo: w.antigo,
        email_outro: w.email_outro,
        adoption_rate: (w.novo + w.antigo) > 0 ? Math.round((w.novo / (w.novo + w.antigo)) * 1000) / 10 : null,
        gd_rate: w.total > 0 ? Math.round((w.gd / w.total) * 1000) / 10 : null,
        avg_lt_total: avg(w.lt_totals),
      }));

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
