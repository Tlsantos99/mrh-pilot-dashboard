import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readFilters, applyFilters } from '@/lib/utils/filters';

export const dynamic = 'force-dynamic';

function fmtDate(d: string | null): string {
  if (!d) return '';
  // d is YYYY-MM-DD, convert to DD-MM-YYYY
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const filters = readFilters(new URL(req.url).searchParams);
    const supabase = createServerClient();

    const PAGE = 1000;
    const SEL = 'occurrence_id,opening_date,wave_name,channel,asf_aggregator';

    const makeQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true)
        .eq('branch', 'Riscos Múltiplos-Habitação');

    const [p1, p2] = await Promise.all([
      applyFilters(makeQ(), filters).range(0, PAGE - 1),
      applyFilters(makeQ(), filters).range(PAGE, PAGE * 2 - 1),
    ]);

    if (p1.error) throw p1.error;

    const rows = [...(p1.data ?? []), ...(p2.data ?? [])];

    // Build CSV
    const header = ['Data Abertura Ocorrência', 'Id_SR', 'Pilot Wave', 'Canal Entrada', 'ASF Agregador'];
    const lines: string[] = [header.map(csvCell).join(',')];

    for (const r of rows) {
      lines.push([
        csvCell(fmtDate(r.opening_date)),
        csvCell(r.occurrence_id),
        csvCell(r.wave_name),
        csvCell(r.channel),
        csvCell(r.asf_aggregator),
      ].join(','));
    }

    // Prepend UTF-8 BOM so Excel opens accented characters correctly
    const csv = '﻿' + lines.join('\r\n');
    const today = new Date().toISOString().substring(0, 10);
    const filename = `ocorrencias_piloto_${today}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
