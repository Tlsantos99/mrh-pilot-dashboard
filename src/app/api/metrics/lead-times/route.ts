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
      .select('opening_year,opening_week,opening_week_label,channel,has_expertise,lt_total,lt_opening_acceptance,closing_date')
      .eq('eligible_for_pilot', true)
      .eq('is_event', false)
      .not('closing_date', 'is', null)
      .not('opening_week_label', 'is', null);
    q = applyFilters(q, filters);

    const { data: rows, error } = await q;
    if (error) throw error;

    type Acc = { year: number; week: number; week_label: string; channel: string; expertise_type: string; lt_totals: number[]; lt_oa: number[] };
    const map = new Map<string, Acc>();
    for (const r of rows ?? []) {
      const et = r.has_expertise ? 'Peritagem' : 'Gestão Direta';
      const key = `${r.opening_week_label}__${r.channel}__${et}`;
      if (!map.has(key)) map.set(key, { year: r.opening_year, week: r.opening_week, week_label: r.opening_week_label, channel: r.channel, expertise_type: et, lt_totals: [], lt_oa: [] });
      const w = map.get(key)!;
      if (r.lt_total != null) w.lt_totals.push(r.lt_total as number);
      if (r.lt_opening_acceptance != null) w.lt_oa.push(r.lt_opening_acceptance as number);
    }

    const data = Array.from(map.values())
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week)
      .map(w => ({
        year: w.year, week: w.week, week_label: w.week_label,
        channel: w.channel, expertise_type: w.expertise_type,
        total: w.lt_totals.length,
        avg_lt_opening_acceptance: avg(w.lt_oa),
        avg_lt_acceptance_closing: null,
        avg_lt_total: avg(w.lt_totals),
      }));

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
