import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readFilters, applyFilters } from '@/lib/utils/filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const filters = readFilters(new URL(req.url).searchParams);
    const supabase = createServerClient();

    const SEL = 'opening_year,opening_week,opening_week_label,channel';
    const makeQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true)
        .eq('branch', 'Riscos Múltiplos-Habitação')
        .not('opening_week_label', 'is', null);

    const PAGE = 1000;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = [];
    let off = 0;
    while (true) {
      const { data, error } = await applyFilters(makeQ(), filters).range(off, off + PAGE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
      off += PAGE;
    }

    type W = { year: number; week: number; week_label: string; novo: number; antigo: number; email_outro: number; total: number };
    const map = new Map<string, W>();
    for (const r of rows ?? []) {
      const key = r.opening_week_label as string;
      if (!map.has(key)) map.set(key, { year: r.opening_year, week: r.opening_week, week_label: key, novo: 0, antigo: 0, email_outro: 0, total: 0 });
      const w = map.get(key)!;
      w.total++;
      if (r.channel === 'Formulário Novo') w.novo++;
      else if (r.channel === 'Formulário Antigo') w.antigo++;
      else w.email_outro++;
    }

    const data = Array.from(map.values())
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week)
      .map(w => ({
        ...w,
        adoption_rate: (w.novo + w.antigo) > 0 ? Math.round((w.novo / (w.novo + w.antigo)) * 1000) / 10 : 0,
      }));

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
