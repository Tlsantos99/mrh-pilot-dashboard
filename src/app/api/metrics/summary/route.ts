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
    const PAGE = 1000;

    const SEL = 'channel,has_expertise,lt_total,lt_opening_acceptance,closing_date,acceptance_date';
    const SEL_BASE = 'has_expertise,lt_total,closing_date';

    const makeQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true)
        .eq('branch', 'Riscos Múltiplos-Habitação');

    const makeQBase = () =>
      supabase.from('occurrences').select(SEL_BASE)
        .eq('eligible_for_pilot', true)
        .eq('branch', 'Riscos Múltiplos-Habitação');

    const [p1, p2, b1, b2, refresh] = await Promise.all([
      applyFilters(makeQ(), filters).range(0, PAGE - 1),
      applyFilters(makeQ(), filters).range(PAGE, PAGE * 2 - 1),
      applyFilters(makeQBase(), baseFilters).range(0, PAGE - 1),
      applyFilters(makeQBase(), baseFilters).range(PAGE, PAGE * 2 - 1),
      supabase.from('upload_history').select('file_type,upload_timestamp')
        .eq('status', 'success').order('upload_timestamp', { ascending: false }).limit(10),
    ]);

    if (p1.error) throw p1.error;
    if (p2.error) throw p2.error;

    const r = [...(p1.data ?? []), ...(p2.data ?? [])];
    const rBase = [...(b1.data ?? []), ...(b2.data ?? [])];

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

    const closed = r.filter(x => x.closing_date && x.lt_total != null) as { lt_total: number; has_expertise: boolean }[];
    const with_acc = r.filter(x => x.acceptance_date && x.lt_opening_acceptance != null) as { lt_opening_acceptance: number }[];
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

    const kpis = {
      total_eligible, total_novo, total_antigo, total_email,
      adoption_rate, gd_rate_global, gd_rate_novo, gd_rate_antigo,
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
