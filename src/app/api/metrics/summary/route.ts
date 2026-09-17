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
    const baseFilters = { ...filters, expertise: undefined };
    // LT is always computed from closed cases — ignore status filter
    const ltFilters = { ...filters, status: undefined };
    const PAGE = 1000;

    const SEL = 'channel,has_expertise,lt_total,lt_opening_acceptance,closing_date,acceptance_date,opening_year,opening_week';
    const SEL_BASE = 'channel,has_expertise,lt_total,lt_opening_acceptance,closing_date';

    const makeQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true)
        .eq('branch', 'Riscos Múltiplos-Habitação');

    const makeQBase = () =>
      supabase.from('occurrences').select(SEL_BASE)
        .eq('eligible_for_pilot', true)
        .eq('branch', 'Riscos Múltiplos-Habitação');

    // LT query: always filters to closed cases, never uses status param
    const makeLtQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true)
        .eq('branch', 'Riscos Múltiplos-Habitação')
        .not('closing_date', 'is', null);

    const [p1, p2, b1, b2, lt1, lt2, refresh] = await Promise.all([
      applyFilters(makeQ(), filters).range(0, PAGE - 1),
      applyFilters(makeQ(), filters).range(PAGE, PAGE * 2 - 1),
      applyFilters(makeQBase(), baseFilters).range(0, PAGE - 1),
      applyFilters(makeQBase(), baseFilters).range(PAGE, PAGE * 2 - 1),
      applyFilters(makeLtQ(), ltFilters).range(0, PAGE - 1),
      applyFilters(makeLtQ(), ltFilters).range(PAGE, PAGE * 2 - 1),
      supabase.from('upload_history').select('file_type,upload_timestamp')
        .eq('status', 'success').order('upload_timestamp', { ascending: false }).limit(10),
    ]);

    if (p1.error) throw p1.error;
    if (p2.error) throw p2.error;

    const r = [...(p1.data ?? []), ...(p2.data ?? [])];
    const rBase = [...(b1.data ?? []), ...(b2.data ?? [])];
    // rLT: always closed cases, ignores status filter — source of truth for all LT KPIs
    const rLT = [...(lt1.data ?? []), ...(lt2.data ?? [])];

    const total_eligible = r.length;
    const total_novo = r.filter(x => x.channel === 'Formulário Novo').length;
    const total_antigo = r.filter(x => x.channel === 'Formulário Antigo').length;
    const total_email = r.filter(x => x.channel === 'Email/Outro').length;
    const novo_antigo = total_novo + total_antigo;
    const adoption_rate = novo_antigo > 0 ? Math.round((total_novo / novo_antigo) * 1000) / 10 : 0;
    const gd_rate_global = total_eligible > 0 ? Math.round((r.filter(x => !x.has_expertise).length / total_eligible) * 1000) / 10 : 0;
    const novo_rows = r.filter(x => x.channel === 'Formulário Novo');
    const antigo_rows = r.filter(x => x.channel === 'Formulário Antigo');
    const gd_rate_novo = novo_rows.length > 0 ? Math.round((novo_rows.filter(x => !x.has_expertise).length / novo_rows.length) * 1000) / 10 : 0;
    const gd_rate_antigo = antigo_rows.length > 0 ? Math.round((antigo_rows.filter(x => !x.has_expertise).length / antigo_rows.length) * 1000) / 10 : 0;

    // LT always computed from rLT (closed cases only, status filter stripped)
    const closed = rLT.filter(x => x.closing_date && x.lt_total != null) as { lt_total: number; has_expertise: boolean }[];
    const with_acc = rLT.filter(x => x.acceptance_date && x.lt_opening_acceptance != null) as { lt_opening_acceptance: number }[];
    const gd_rows = r.filter(x => !x.has_expertise);
    const peritagem_rows = r.filter(x => x.has_expertise);
    const closed_gd = closed.filter(x => !x.has_expertise);
    const closed_peritagem = closed.filter(x => x.has_expertise);

    // Base counts (wave/channel/status filtered, but NOT expertise filtered)
    const gd_rows_base = rBase.filter(x => !x.has_expertise);
    const peritagem_rows_base = rBase.filter(x => x.has_expertise);
    const closed_base = rBase.filter(x => x.closing_date && x.lt_total != null) as { lt_total: number; has_expertise: boolean }[];
    const closed_gd_base = closed_base.filter(x => !x.has_expertise);
    const closed_peritagem_base = closed_base.filter(x => x.has_expertise);

    // GD rates for closed cases only (by channel)
    const closed_base_all = closed_base as { channel?: string; has_expertise: boolean; lt_total: number; lt_opening_acceptance?: number | null }[];
    const gd_rate_closed = closed_base.length > 0
      ? Math.round((closed_gd_base.length / closed_base.length) * 1000) / 10 : 0;
    const closed_novo_base = closed_base_all.filter(x => x.channel === 'Formulário Novo');
    const closed_antigo_base = closed_base_all.filter(x => x.channel === 'Formulário Antigo');
    const gd_rate_novo_closed = closed_novo_base.length > 0
      ? Math.round((closed_novo_base.filter(x => !x.has_expertise).length / closed_novo_base.length) * 1000) / 10 : 0;
    const gd_rate_antigo_closed = closed_antigo_base.length > 0
      ? Math.round((closed_antigo_base.filter(x => !x.has_expertise).length / closed_antigo_base.length) * 1000) / 10 : 0;
    // LT abertura→aceitação for Formulário Novo specifically (closed cases — from rLT)
    const with_acc_novo = (rLT as { channel?: string; lt_opening_acceptance?: number | null }[])
      .filter(x => x.channel === 'Formulário Novo' && x.lt_opening_acceptance != null) as { lt_opening_acceptance: number }[];

    // Rolling 4-week adoption rate — last 4 ISO weeks with data
    const allWeeks = r
      .filter(x => x.opening_year && x.opening_week)
      .map(x => ({ year: x.opening_year as number, week: x.opening_week as number }));
    let adoption_rate_last4w: number | null = null;
    let last4w_label: string | null = null;
    if (allWeeks.length) {
      const maxYear = Math.max(...allWeeks.map(w => w.year));
      const maxWeek = Math.max(...allWeeks.filter(w => w.year === maxYear).map(w => w.week));
      // Build last 4 ISO week slots (going backwards from maxYear/maxWeek)
      const slots: Array<{ year: number; week: number }> = [];
      let y = maxYear, w = maxWeek;
      for (let i = 0; i < 4; i++) {
        slots.push({ year: y, week: w });
        w--;
        if (w < 1) { y--; w = 52; } // approximate — ISO can have 53 but 52 is safe for rolling window
      }
      const last4 = r.filter(x =>
        slots.some(s => s.year === (x.opening_year as number) && s.week === (x.opening_week as number))
      );
      const l4novo = last4.filter(x => x.channel === 'Formulário Novo').length;
      const l4antigo = last4.filter(x => x.channel === 'Formulário Antigo').length;
      const l4sum = l4novo + l4antigo;
      adoption_rate_last4w = l4sum > 0 ? Math.round((l4novo / l4sum) * 1000) / 10 : 0;
      const minSlot = slots[slots.length - 1];
      last4w_label = `W${String(minSlot.week).padStart(2,'0')}–W${String(maxWeek).padStart(2,'0')}`;
    }

    const kpis = {
      total_eligible, total_novo, total_antigo, total_email,
      adoption_rate, adoption_rate_last4w, last4w_label, gd_rate_global, gd_rate_novo, gd_rate_antigo,
      gd_rate_closed, gd_rate_novo_closed, gd_rate_antigo_closed,
      total_gd: gd_rows.length, total_peritagem: peritagem_rows.length,
      closed_gd_count: closed_gd.length, closed_peritagem_count: closed_peritagem.length,
      total_gd_base: gd_rows_base.length,
      total_peritagem_base: peritagem_rows_base.length,
      closed_gd_count_base: closed_gd_base.length,
      closed_peritagem_count_base: closed_peritagem_base.length,
      avg_lt_total: avg(closed.map(x => x.lt_total)),
      avg_lt_gd: avg(closed_gd.map(x => x.lt_total)),
      avg_lt_expertise: avg(closed_peritagem.map(x => x.lt_total)),
      avg_lt_opening_acceptance: avg(with_acc.map(x => x.lt_opening_acceptance)),
      avg_lt_opening_acceptance_novo: avg(with_acc_novo.map(x => x.lt_opening_acceptance)),
    };

    const lastUpdate: Record<string, string> = {};
    for (const row of refresh.data ?? []) {
      if (!lastUpdate[row.file_type]) lastUpdate[row.file_type] = row.upload_timestamp;
    }

    return NextResponse.json({ kpis, lastUpdate });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
