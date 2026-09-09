import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readFilters, applyFilters } from '@/lib/utils/filters';

export const dynamic = 'force-dynamic';

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}

// ISO week from a date string — groups LT by the week the case was CLOSED,
// not when it was opened (grouping by open week biases recent weeks downward
// because only fast-closing cases are already closed)
function isoWeekOf(dateStr: string): { year: number; week: number; label: string } {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  const year = d.getFullYear();
  return { year, week, label: `${year}-W${String(week).padStart(2, '0')}` };
}

export async function GET(req: NextRequest) {
  try {
    const filters = readFilters(new URL(req.url).searchParams);
    const supabase = createServerClient();

    const SEL = 'channel,has_expertise,lt_total,lt_opening_acceptance,closing_date';
    const makeQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true).eq('is_event', false)
        .eq('branch', 'Riscos Múltiplos-Habitação')
        .not('closing_date', 'is', null);

    const [{ data: p1, error: e1 }, { data: p2, error: e2 }] = await Promise.all([
      applyFilters(makeQ(), filters).range(0, 999),
      applyFilters(makeQ(), filters).range(1000, 1999),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const rows = [...(p1 ?? []), ...(p2 ?? [])];

    type Acc = { year: number; week: number; week_label: string; channel: string; expertise_type: string; lt_totals: number[]; lt_oa: number[] };
    const map = new Map<string, Acc>();
    for (const r of rows ?? []) {
      if (!r.closing_date) continue;
      const { year, week, label } = isoWeekOf(r.closing_date as string);
      const et = r.has_expertise ? 'Peritagem' : 'Gestão Direta';
      const key = `${label}__${r.channel}__${et}`;
      if (!map.has(key)) map.set(key, { year, week, week_label: label, channel: r.channel, expertise_type: et, lt_totals: [], lt_oa: [] });
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
