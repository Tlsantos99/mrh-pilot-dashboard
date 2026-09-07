import { parseISODate } from '@/lib/utils/dates';
import { computeRowHash } from '@/lib/utils/hash';

type RawRow = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

function parseWaveNumber(waveStr: string | null): number | null {
  if (!waveStr) return null;
  const match = waveStr.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

export function processAgentesRow(raw: RawRow, uploadId: string, sourceRow: number) {
  const waveStr = str(raw['Wave']);
  const waveStartRaw = str(raw['Data Início Wave']);
  const waveStart = parseISODate(waveStartRaw);

  const mapped = {
    upload_id: uploadId,
    wave: waveStr,
    wave_start_date: waveStart ? waveStart.toISOString().substring(0, 10) : null,
    asf_aggregator: str(raw['ASF Agregador']),
    normalized_name: str(raw['Nome Normalizado']),
    agent_full_name: str(raw['Agente']),
    agent_code: str(raw['Código Agente']),
    tipology: str(raw['Tipologia']),
    source_row: sourceRow,
  };

  const hashData = {
    agent_code: mapped.agent_code,
    wave: mapped.wave,
    wave_start_date: mapped.wave_start_date,
  };

  return { ...mapped, row_hash: computeRowHash(hashData) };
}

export function buildAgentRecord(staged: {
  agent_code: string | null;
  normalized_name: string | null;
  asf_aggregator: string | null;
  agent_full_name: string | null;
  wave: string | null;
  wave_start_date: string | null;
  tipology: string | null;
}) {
  if (!staged.agent_code) return null;
  const waveNumber = parseWaveNumber(staged.wave);
  return {
    agent_code: staged.agent_code,
    normalized_name: staged.normalized_name,
    asf_aggregator: staged.asf_aggregator,
    agent_full_name: staged.agent_full_name,
    wave_number: waveNumber,
    wave_name: staged.wave,
    wave_start_date: staged.wave_start_date,
    tipology: staged.tipology,
  };
}
