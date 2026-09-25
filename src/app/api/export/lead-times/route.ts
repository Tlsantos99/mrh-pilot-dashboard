import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase/server';
import { readFilters, applyFilters } from '@/lib/utils/filters';

export const dynamic = 'force-dynamic';

function fmtDate(d: string | null): string {
  if (!d) return '';
  const parts = d.substring(0, 10).split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export async function GET(req: NextRequest) {
  try {
    const rawFilters = readFilters(new URL(req.url).searchParams);
    const filters = { ...rawFilters, status: undefined };
    const supabase = createServerClient();

    const SEL = [
      'occurrence_id',
      'channel',
      'asf_aggregator',
      'wave_name',
      'agent_name',
      'has_expertise',
      'participation_date',
      'opening_date',
      'opening_week_label',
      'acceptance_date',
      'closing_date',
      'lt_participation_opening',
      'lt_opening_acceptance',
      'lt_acceptance_closing',
      'lt_total',
    ].join(',');

    const makeQ = () =>
      supabase.from('occurrences').select(SEL)
        .eq('eligible_for_pilot', true)
        .eq('branch', 'Riscos Múltiplos-Habitação')
        .not('closing_date', 'is', null)
        .order('opening_date', { ascending: true });

    const PAGE = 1000;
    const rows: Record<string, unknown>[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await applyFilters(makeQ(), filters).range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Build worksheet data — header row + data rows
    const wsData: unknown[][] = [
      [
        'Nr Ocorrência',
        'Canal',
        'ASF Agregador',
        'Wave',
        'Agente',
        'Tipo',
        'Semana Abertura',
        'Data Participação',
        'Data Abertura',
        'Data Aceitação',
        'Data Encerramento',
        'LT Part→Abertura (dias úteis)',
        'LT Abertura→Aceitação (dias úteis)',
        'LT Aceitação→Fecho (dias úteis)',
        'LT Total (dias úteis)',
      ],
      ...rows.map(r => [
        r.occurrence_id ?? '',
        r.channel ?? '',
        r.asf_aggregator ?? '',
        r.wave_name ?? '',
        r.agent_name ?? '',
        r.has_expertise ? 'Peritagem' : 'Gestão Direta',
        r.opening_week_label ?? '',
        fmtDate(r.participation_date as string | null),
        fmtDate(r.opening_date as string | null),
        fmtDate(r.acceptance_date as string | null),
        fmtDate(r.closing_date as string | null),
        r.lt_participation_opening ?? '',
        r.lt_opening_acceptance ?? '',
        r.lt_acceptance_closing ?? '',
        r.lt_total ?? '',
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 18 }, // Nr Ocorrência
      { wch: 18 }, // Canal
      { wch: 38 }, // ASF Agregador
      { wch: 10 }, // Wave
      { wch: 22 }, // Agente
      { wch: 16 }, // Tipo
      { wch: 13 }, // Semana
      { wch: 14 }, // Data Participação
      { wch: 14 }, // Data Abertura
      { wch: 14 }, // Data Aceitação
      { wch: 14 }, // Data Encerramento
      { wch: 14 }, // LT Part→Abertura
      { wch: 14 }, // LT Abertura→Aceitação
      { wch: 14 }, // LT Aceitação→Fecho
      { wch: 12 }, // LT Total
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Abertura Aceitação');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const today = new Date().toISOString().substring(0, 10);
    const filename = `abertura_aceitacao_${today}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
