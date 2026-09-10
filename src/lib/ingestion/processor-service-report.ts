import { getISOWeek } from '@/lib/utils/business-days';
import { parseHHMMSStoMinutes } from '@/lib/utils/dates';

// Each row arrives as { "0": val, "1": val, ... } (raw column indices as string keys).
// The process route reads the sheet with header:1 (array mode) starting from data row 5.
//
// Column mapping (0-indexed) for date rows in "Relatório de perfomance de serv":
//  0 → date (DD/MM/YYYY) — identifies the daily total row
//  5 → Total de Interações Oferecidas
//  7 → Interações tratadas (handled/answered)
//  8 → Total de Interações Abandonadas
//  12 → Interações Rejeitadas
//  15 → Tempo médio de tratamento (HH:MM:SS)
//  17 → Atraso médio de resposta (HH:MM:SS)
//  19 → Tempo médio de conversação (HH:MM:SS)
//  21 → Nível de Serviço 1 %
//  22 → Nível de Serviço 2 %
//  24 → Nível de Serviço 3 %

type RawRow = Record<string, unknown>;

function col(row: RawRow, idx: number): unknown {
  return row[String(idx)] ?? null;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}

function parseDDMMYYYY(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
}

export function processServiceReportRows(
  rawData: RawRow[],
  uploadId: string,
): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  for (const row of rawData) {
    // Only process date rows: col 0 must be DD/MM/YYYY
    const callDate = parseDDMMYYYY(col(row, 0));
    if (!callDate) continue;

    const callDateISO = callDate.toISOString().substring(0, 10);
    const isoWeek = getISOWeek(callDate);

    const avgHandleRaw = col(row, 15);
    const avgWaitRaw = col(row, 17);
    const avgConvRaw = col(row, 19);

    results.push({
      call_date: callDateISO,
      total_offered: numOrNull(col(row, 5)),
      handled: numOrNull(col(row, 7)),
      abandoned: numOrNull(col(row, 8)),
      rejected: numOrNull(col(row, 12)),
      avg_handle_minutes: parseHHMMSStoMinutes(avgHandleRaw ? String(avgHandleRaw).trim() : null),
      avg_wait_minutes: parseHHMMSStoMinutes(avgWaitRaw ? String(avgWaitRaw).trim() : null),
      avg_conversation_minutes: parseHHMMSStoMinutes(avgConvRaw ? String(avgConvRaw).trim() : null),
      service_level_1: numOrNull(col(row, 21)),
      service_level_2: numOrNull(col(row, 22)),
      service_level_3: numOrNull(col(row, 24)),
      call_year: isoWeek?.year ?? null,
      call_week: isoWeek?.week ?? null,
      call_week_label: isoWeek?.label ?? null,
      source_upload_id: uploadId,
    });
  }

  return results;
}
