/**
 * Central date parsing module.
 * Each source has a different date format — always parse explicitly.
 */

const NULL_SENTINELS = ['1900-01-01', '1800-01-01'];

function isNullSentinel(d: Date | null): boolean {
  if (!d) return true;
  return d.getFullYear() < 2000;
}

/**
 * Parse ISO date string: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
 * Used by: FicheiroGlobal
 */
export function parseISODate(raw: string | null | undefined): Date | null {
  if (!raw || raw.trim() === '') return null;
  const s = raw.trim().substring(0, 10); // take YYYY-MM-DD part
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  if (isNullSentinel(d)) return null;
  return d;
}

/**
 * Parse ISO datetime: YYYY-MM-DD HH:MM:SS or YYYY-MM-DD HH:MM:SS.nnnnnnn
 * Used by: FicheiroGlobal participation_date, occurrence_date
 */
export function parseISODatetime(raw: string | null | undefined): Date | null {
  if (!raw || raw.trim() === '') return null;
  const s = raw.trim().substring(0, 19).replace(' ', 'T') + 'Z';
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  if (isNullSentinel(d)) return null;
  return d;
}

/**
 * Parse US format: MM/DD/YYYY HH:MM:SS (text)
 * Used by: Report_* / Piloto Agentes DATA_PEDIDO
 */
export function parseUSDatetime(raw: string | null | undefined): Date | null {
  if (!raw || raw.trim() === '') return null;
  const s = raw.trim();
  // MM/DD/YYYY HH:MM:SS
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, mm, dd, yyyy, hh, min, sec] = match;
  const d = new Date(`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${hh}:${min}:${sec}Z`);
  if (isNaN(d.getTime())) return null;
  if (isNullSentinel(d)) return null;
  return d;
}

/**
 * Parse PT dash format: dd-mm-yyyy hh:mm:ss
 * Used by: Formulário Antigo
 */
export function parsePTDashDatetime(raw: string | null | undefined): Date | null {
  if (!raw || raw.trim() === '') return null;
  const s = raw.trim();
  const match = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh = '00', min = '00', sec = '00'] = match;
  const d = new Date(`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${hh}:${min}:${sec}Z`);
  if (isNaN(d.getTime())) return null;
  if (isNullSentinel(d)) return null;
  return d;
}

/**
 * Parse Excel serial number to Date.
 * Excel epoch: 1900-01-01 = 1 (with the 1900 leap year bug: 1900-02-29 = 60 doesn't exist)
 * Used by: Chamadas (Data column stored as numeric serial)
 */
export function parseExcelSerial(serial: number | string | null | undefined): Date | null {
  if (serial === null || serial === undefined || serial === '') return null;
  const n = typeof serial === 'string' ? parseFloat(serial) : serial;
  if (isNaN(n) || n <= 0) return null;
  // Excel serial: days since 1899-12-30 (accounts for 1900 leap year bug)
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + n * 86400000);
  if (isNullSentinel(d)) return null;
  return d;
}

/**
 * Parse HH:MM:SS string to decimal minutes.
 */
export function parseHHMMSStoMinutes(raw: string | null | undefined): number | null {
  if (!raw || raw.trim() === '') return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, hh, mm, ss] = match;
  return parseInt(hh) * 60 + parseInt(mm) + parseInt(ss) / 60;
}

/**
 * Format Date to ISO date string YYYY-MM-DD for storage.
 */
export function toISODateStr(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().substring(0, 10);
}

/**
 * Format Date to display string DD/MM/YYYY.
 */
export function toDisplayDate(d: Date | null): string | null {
  if (!d) return null;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Parse "Sim"/"Não" to boolean.
 */
export function parseSimNao(raw: string | null | undefined): boolean | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'sim') return true;
  if (s === 'não' || s === 'nao') return false;
  return null;
}

/**
 * Parse numeric string, treating sentinel values and empty as null.
 */
export function parseNumeric(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
  if (isNaN(n)) return null;
  return n;
}

/**
 * Check if time string is within business hours 08:30–16:30.
 */
export function isWithinBusinessHours(timeStr: string | null | undefined): boolean | null {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const totalMinutes = hours * 60 + minutes;
  const start = 8 * 60 + 30;  // 08:30
  const end = 16 * 60 + 30;   // 16:30
  return totalMinutes >= start && totalMinutes <= end;
}
