import { getISOWeek } from '@/lib/utils/business-days';
import { parseHHMMSStoMinutes } from '@/lib/utils/dates';

type RawRow = Record<string, unknown>;

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

// Sheet 2 "Relatório de perfomance de serv" has a mixed structure:
// - Date rows: Col A (index 0) has DD/MM/YYYY
// - Service rows: same totals but Col C (index 2) has service name
// - Time interval rows: Col E (index 4) has HH:MM:SS
// We only want date rows (Col A is a date string).
//
// Column mapping (1-indexed from summary):
// Col 1 → date, Col 6 → total_offered, Col 7 → queued,
// Col 8 → handled, Col 9 → abandoned, Col 10 → abandoned_queue,
// Col 11 → abandoned_ivr, Col 13 → rejected,
// Col 16 → avg_handle (HH:MM:SS), Col 18 → avg_wait (HH:MM:SS),
// Col 20 → avg_conversation (HH:MM:SS), Col 22 → sl1, Col 23 → sl2, Col 25 → sl3

export function processServiceReportRows(
  rawData: RawRow[],
  uploadId: string,
): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  for (const row of rawData) {
    const colValues = Object.values(row);
    // Col 0 (A) must be a date string DD/MM/YYYY
    const col0 = colValues[0];
    if (!col0) continue;
    const dateStr = String(col0).trim();
    const callDate = parseDDMMYYYY(dateStr);
    if (!callDate) continue; // skip service rows, interval rows, totals, etc.

    const callDateISO = callDate.toISOString().substring(0, 10);
    const isoWeek = getISOWeek(callDate);

    // Col indices (0-based): 5=total_offered, 7=handled, 8=abandoned, 12=rejected
    // 15=avg_handle, 17=avg_wait, 19=avg_conversation, 21=sl1, 22=sl2, 24=sl3
    const totalOffered = numOrNull(colValues[5]);
    const handled = numOrNull(colValues[7]);
    const abandoned = numOrNull(colValues[8]);
    const rejected = numOrNull(colValues[12]);
    const avgHandleRaw = colValues[15] ? String(colValues[15]).trim() : null;
    const avgWaitRaw = colValues[17] ? String(colValues[17]).trim() : null;
    const avgConvRaw = colValues[19] ? String(colValues[19]).trim() : null;
    const sl1 = numOrNull(colValues[21]);
    const sl2 = numOrNull(colValues[22]);
    const sl3 = numOrNull(colValues[24]);

    results.push({
      call_date: callDateISO,
      total_offered: totalOffered,
      handled: handled,
      abandoned: abandoned,
      rejected: rejected,
      avg_handle_minutes: parseHHMMSStoMinutes(avgHandleRaw),
      avg_wait_minutes: parseHHMMSStoMinutes(avgWaitRaw),
      avg_conversation_minutes: parseHHMMSStoMinutes(avgConvRaw),
      service_level_1: sl1,
      service_level_2: sl2,
      service_level_3: sl3,
      call_year: isoWeek?.year ?? null,
      call_week: isoWeek?.week ?? null,
      call_week_label: isoWeek?.label ?? null,
      source_upload_id: uploadId,
    });
  }

  return results;
}
