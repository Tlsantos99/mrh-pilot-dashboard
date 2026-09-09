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

    const SEL = 'asf_aggregator,wave_number,wave_name,channel,has_expertise,lt_total,closing_date,opening_date';
    const makeQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true)
        .eq('branch', 'Riscos Múltiplos-Habitação');

    const [{ data: p1, error: e1 }, { data: p2, error: e2 }] = await Promise.all([
      applyFilters(makeQ(), filters).range(0, 999),
      applyFilters(makeQ(), filters).range(1000, 1999),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const rows = [...(p1 ?? []), ...(p2 ?? [])];

    // 7-day window ending at max_date (inclusive), or today if no filter
    const refDate = filters.max_date ? new Date(filters.max_date) : new Date();
    refDate.setHours(23, 59, 59, 999);
    const windowStart = new Date(refDate);
    windowStart.setDate(windowStart.getDate() - 6);
    windowStart.setHours(0, 0, 0, 0);

    type Acc = {
      asf_aggregator: string; wave_number: number; wave_name: string;
      total: number; novo: number; antigo: number; email_outro: number; gd: number; lt_totals: number[];
      novo_7d: number; antigo_7d: number;
    };
    const map = new Map<string, Acc>();
    for (const r of rows ?? []) {
      if (!r.asf_aggregator) continue;
      const key = r.asf_aggregator as string;
      if (!map.has(key)) map.set(key, {
        asf_aggregator: key, wave_number: r.wave_number, wave_name: r.wave_name,
        total: 0, novo: 0, antigo: 0, email_outro: 0, gd: 0, lt_totals: [],
        novo_7d: 0, antigo_7d: 0,
      });
      const w = map.get(key)!;
      w.total++;
      if (r.channel === 'Formulário Novo') w.novo++;
      else if (r.channel === 'Formulário Antigo') w.antigo++;
      else w.email_outro++;
      if (!r.has_expertise) w.gd++;
      if (r.closing_date && r.lt_total != null) w.lt_totals.push(r.lt_total as number);
      // Track last-7-days counts for adoption trend
      if (r.opening_date) {
        const od = new Date(r.opening_date as string);
        if (od >= windowStart && od <= refDate) {
          if (r.channel === 'Formulário Novo') w.novo_7d++;
          else if (r.channel === 'Formulário Antigo') w.antigo_7d++;
        }
      }
    }

    const data = Array.from(map.values())
      .sort((a, b) => {
        if ((a.wave_number ?? 99) !== (b.wave_number ?? 99)) return (a.wave_number ?? 99) - (b.wave_number ?? 99);
        const ar = a.novo + a.antigo > 0 ? a.novo / (a.novo + a.antigo) : -1;
        const br = b.novo + b.antigo > 0 ? b.novo / (b.novo + b.antigo) : -1;
        return br - ar;
      })
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
        adoption_last7d: (w.novo_7d + w.antigo_7d) > 0 ? Math.round(w.novo_7d / (w.novo_7d + w.antigo_7d) * 1000) / 10 : null,
      }));

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
