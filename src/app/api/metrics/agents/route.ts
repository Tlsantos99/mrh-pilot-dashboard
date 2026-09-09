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

    const SEL = 'asf_aggregator,wave_number,wave_name,channel,has_expertise,lt_total,closing_date,opening_week_label,opening_year,opening_week';
    const makeQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true).eq('is_event', false)
        .eq('branch', 'Riscos Múltiplos-Habitação');

    const [{ data: p1, error: e1 }, { data: p2, error: e2 }] = await Promise.all([
      applyFilters(makeQ(), filters).range(0, 999),
      applyFilters(makeQ(), filters).range(1000, 1999),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const rows = [...(p1 ?? []), ...(p2 ?? [])];

    type WeekData = { year: number; week: number; novo: number; antigo: number };
    type Acc = {
      asf_aggregator: string; wave_number: number; wave_name: string;
      total: number; novo: number; antigo: number; email_outro: number; gd: number; lt_totals: number[];
      weekly: Map<string, WeekData>;
    };
    const map = new Map<string, Acc>();
    for (const r of rows ?? []) {
      if (!r.asf_aggregator) continue;
      const key = r.asf_aggregator as string;
      if (!map.has(key)) map.set(key, {
        asf_aggregator: key, wave_number: r.wave_number, wave_name: r.wave_name,
        total: 0, novo: 0, antigo: 0, email_outro: 0, gd: 0, lt_totals: [],
        weekly: new Map(),
      });
      const w = map.get(key)!;
      w.total++;
      if (r.channel === 'Formulário Novo') w.novo++;
      else if (r.channel === 'Formulário Antigo') w.antigo++;
      else w.email_outro++;
      if (!r.has_expertise) w.gd++;
      if (r.closing_date && r.lt_total != null) w.lt_totals.push(r.lt_total as number);
      // Track weekly counts for last-week and 4-week adoption
      if (r.opening_week_label) {
        const wk = r.opening_week_label as string;
        if (!w.weekly.has(wk)) w.weekly.set(wk, { year: r.opening_year as number, week: r.opening_week as number, novo: 0, antigo: 0 });
        const wd = w.weekly.get(wk)!;
        if (r.channel === 'Formulário Novo') wd.novo++;
        else if (r.channel === 'Formulário Antigo') wd.antigo++;
      }
    }

    // Find the 4 most recent opening weeks across all data
    const allWeeksSorted = Array.from(
      new Set(rows.filter(r => r.opening_week_label).map(r => r.opening_week_label as string))
    ).map(label => {
      const r = rows.find(x => x.opening_week_label === label)!;
      return { label, year: r.opening_year as number, week: r.opening_week as number };
    }).sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week);

    const lastWeekLabel = allWeeksSorted[allWeeksSorted.length - 1]?.label ?? '';
    const last4Labels = new Set(allWeeksSorted.slice(-4).map(w => w.label));

    const data = Array.from(map.values())
      .sort((a, b) => {
        if ((a.wave_number ?? 99) !== (b.wave_number ?? 99)) return (a.wave_number ?? 99) - (b.wave_number ?? 99);
        const ar = a.novo + a.antigo > 0 ? a.novo / (a.novo + a.antigo) : -1;
        const br = b.novo + b.antigo > 0 ? b.novo / (b.novo + b.antigo) : -1;
        return br - ar;
      })
      .map(w => {
        const lw = w.weekly.get(lastWeekLabel) ?? { novo: 0, antigo: 0 };
        let novo4 = 0, antigo4 = 0;
        w.weekly.forEach((wd, label) => {
          if (last4Labels.has(label)) { novo4 += wd.novo; antigo4 += wd.antigo; }
        });
        return {
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
          novo_last_week: lw.novo,
          antigo_last_week: lw.antigo,
          adoption_4weeks: (novo4 + antigo4) > 0 ? Math.round(novo4 / (novo4 + antigo4) * 1000) / 10 : null,
        };
      });

    return NextResponse.json({ data, last_week_label: lastWeekLabel });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
