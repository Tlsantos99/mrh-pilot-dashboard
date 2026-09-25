import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readFilters, applyFilters } from '@/lib/utils/filters';

export const dynamic = 'force-dynamic';

function fmtDate(d: string | null): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function fmtDateTime(d: string | null): string {
  if (!d) return '';
  // participation_date may include time component
  const date = d.substring(0, 10);
  return fmtDate(date);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes(';')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
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

    const header = [
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
    ];

    const lines: string[] = [header.map(csvCell).join(';')];

    for (const r of rows) {
      lines.push([
        csvCell(r.occurrence_id),
        csvCell(r.channel),
        csvCell(r.asf_aggregator),
        csvCell(r.wave_name),
        csvCell(r.agent_name),
        csvCell(r.has_expertise ? 'Peritagem' : 'Gestão Direta'),
        csvCell(r.opening_week_label),
        csvCell(fmtDateTime(r.participation_date as string | null)),
        csvCell(fmtDate(r.opening_date as string | null)),
        csvCell(fmtDate(r.acceptance_date as string | null)),
        csvCell(fmtDate(r.closing_date as string | null)),
        csvCell(r.lt_participation_opening),
        csvCell(r.lt_opening_acceptance),
        csvCell(r.lt_acceptance_closing),
        csvCell(r.lt_total),
      ].join(';'));
    }

    const csv = '﻿' + 'sep=;\r\n' + lines.join('\r\n');
    const today = new Date().toISOString().substring(0, 10);
    const filename = `abertura_aceitacao_${today}.csv`;

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
