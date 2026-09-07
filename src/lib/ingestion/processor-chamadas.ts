import {
  parseExcelSerial,
  parseHHMMSStoMinutes,
  parseSimNao,
  isWithinBusinessHours,
} from '@/lib/utils/dates';
import { computeRowHash } from '@/lib/utils/hash';
import { getISOWeek } from '@/lib/utils/business-days';

type RawRow = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

export function processChamadasRow(raw: RawRow, uploadId: string, sourceRow: number) {
  // Data is stored as Excel serial number
  const dataRaw = raw['Data'];
  const callDate = typeof dataRaw === 'number'
    ? parseExcelSerial(dataRaw)
    : parseExcelSerial(String(dataRaw));

  const callDateStr = callDate ? callDate.toISOString().substring(0, 10) : null;
  const callTimeStr = str(raw['Hora']);

  const withinHours = callTimeStr ? isWithinBusinessHours(callTimeStr) : null;
  const isoWeek = callDate ? getISOWeek(callDate) : null;

  const durationRaw = str(raw['Duração da Chamada']);
  const waitRaw = str(raw['Tempo Espera']);

  const mapped = {
    upload_id: uploadId,
    original_session_id: str(raw['OriginalSessionID']),
    session_id: str(raw['Session ID']),
    parent_session_id: str(raw['ParentSessionID']),
    call_date: callDateStr,
    call_time: callTimeStr,
    contact: str(raw['Contacto']),
    service: str(raw['Serviço']),
    service_id: str(raw['Service ID']),
    call_duration_raw: durationRaw,
    call_duration_minutes: parseHHMMSStoMinutes(durationRaw),
    wait_time_raw: waitRaw,
    wait_time_minutes: parseHHMMSStoMinutes(waitRaw),
    agent_id: str(raw['Agent ID']),
    agent_login: str(raw['Agente']),
    agent_name: str(raw['Nome do Agente']),
    answered: parseSimNao(str(raw['Atendida'])),
    abandoned: parseSimNao(str(raw['Abandonada'])),
    within_business_hours: withinHours,
    call_year: isoWeek?.year ?? null,
    call_week: isoWeek?.week ?? null,
    call_week_label: isoWeek?.label ?? null,
    source_row: sourceRow,
  };

  const hashData = {
    session_id: mapped.session_id,
    call_date: mapped.call_date,
    call_time: mapped.call_time,
    contact: mapped.contact,
  };

  return { ...mapped, row_hash: computeRowHash(hashData) };
}
