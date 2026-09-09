import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readFilters, applyFilters } from '@/lib/utils/filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const filters = readFilters(new URL(req.url).searchParams);
    const supabase = createServerClient();

    const SEL = 'opening_year,opening_week,opening_week_label,channel,has_expertise';
    const makeQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true).eq('is_event', false)
        .eq('branch', 'Riscos Múltiplos-Habitação')
        .not('opening_week_label', 'is', null)
        .in('channel', ['Formulário Novo', 'Formulário Antigo']);

    const [{ data: p1, error: e1 }, { data: p2, error: e2 }] = await Promise.all([
      applyFilters(makeQ(), filters).range(0, 999),
      applyFilters(makeQ(), filters).range(1000, 1999),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const rows = [...(p1 ?? []), ...(p2 ?? [])];

    type Acc = { year: number; week: number; week_label: string; channel: string; total: number; gd_count: number };
    const map = new Map<string, Acc>();
    for (const r of rows ?? []) {
      const key = `${r.opening_week_label}__${r.channel}`;
      if (!map.has(key)) map.set(key, { year: r.opening_year, week: r.opening_week, week_label: r.opening_week_label, channel: r.channel, total: 0, gd_count: 0 });
      const w = map.get(key)!;
      w.total++;
      if (!r.has_expertise) w.gd_count++;
    }

    const data = Array.from(map.values())
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.week !== b.week ? a.week - b.week : a.channel.localeCompare(b.channel))
      .map(w => ({
        ...w,
        expertise_count: w.total - w.gd_count,
        gd_rate: w.total > 0 ? Math.round((w.gd_count / w.total) * 1000) / 10 : 0,
      }));

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
