import { parseISODate, parseISODatetime, parseNumeric } from '@/lib/utils/dates';
import { computeRowHash } from '@/lib/utils/hash';

type RawRow = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

function parseGlobalDate(v: unknown): string | null {
  const raw = str(v);
  if (!raw) return null;
  // Could be YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
  const d = raw.length > 10 ? parseISODatetime(raw) : parseISODate(raw);
  return d ? d.toISOString().substring(0, 10) : null;
}

function parseGlobalDatetime(v: unknown): string | null {
  const raw = str(v);
  if (!raw) return null;
  const d = parseISODatetime(raw) ?? parseISODate(raw);
  return d ? d.toISOString() : null;
}

export function processGlobalRow(raw: RawRow, uploadId: string, sourceRow: number) {
  const mapped = {
    upload_id: uploadId,
    occurrence_id: str(raw['Ocorrência']),
    process_number: str(raw['Número Processo']),
    policy_number: str(raw['Nº Apólice']),
    event_code: str(raw['Código de Evento']),
    company: str(raw['Companhia']),
    provider: str(raw['Prestador']),
    group_branch: str(raw['Grupo Ramo']),
    branch: str(raw['Ramo']),
    coverage: str(raw['Cobertura']),
    occurrence_complexity: str(raw['Complexidade Ocorrência']),
    claim_complexity: str(raw['Complexidade Sinistro']),
    claim_type: str(raw['Tipo Sinistro']),
    district: str(raw['Distrito']),
    occurrence_status: str(raw['Estado Ocorrência']),
    claim_status: str(raw['Estado Sinistro']),
    status_reason: str(raw['Motivo Estado']),
    service_number: str(raw['Numero Serviço']),
    service_status: str(raw['Estado Serviço']),
    participation_date: parseGlobalDatetime(raw['Data Participação']),
    occurrence_date: parseGlobalDatetime(raw['Data Ocorrência']),
    opening_date: parseGlobalDate(raw['Data Abertura Ocorrência']),
    // double space in column name
    reopening_date: parseGlobalDate(raw['Data  Reabertura Ocorrência'] ?? raw['Data Reabertura Ocorrência']),
    acceptance_date: parseGlobalDate(raw['Data Aceitação Sinistro']),
    manager: str(raw['Gestor']),
    responsibility_status: str(raw['Estado Responsabilidade']),
    tempestade_leslie: str(raw['Tempestade Leslie']),
    // trailing space in column
    fraud_suspicion: str(raw['Supeita de Fraude '] ?? raw['Supeita de Fraude']),
    co_insurance: str(raw['Co Seguro']),
    contentious: str(raw['Contencioso']),
    reimbursement: str(raw['Reembolso']),
    total_provision: parseNumeric(raw['Provisão Total']),
    initial_provision: parseNumeric(raw['Provisão Inicial']),
    available_provision: parseNumeric(raw['Provisão Disponível']),
    payments: parseNumeric(raw['Pagamentos']),
    indemnities: parseNumeric(raw['Indemnizações']),
    expertise_costs: parseNumeric(raw['Despesas c Peritagem']),
    general_expenses: parseNumeric(raw['Despesas Gerais']),
    service_creation_date: parseGlobalDate(raw['Data da Criação do Serviço']),
    service_booking_date: parseGlobalDate(raw['Data da Marcação do Serviço']),
    first_responsibility_date: parseGlobalDate(raw['Primeira data de definição de responsabilidade']),
    first_payment_date: parseGlobalDate(raw['Primeira Data do Pagamento da Indemnização Reparação']),
    last_payment_date: parseGlobalDate(raw['Última Data do Pagamento da Indemnização Reparação']),
    closing_date_admin: parseGlobalDate(raw['Data de Encerramento da Ocorrência Administrativo']),
    closing_date_accounting: parseGlobalDate(raw['Data de Encerramento da Ocorrência Contabilístico']),
    agent_code: str(raw['Código Agente']),
    source_row: sourceRow,
  };

  // Compute row hash from key fields (stable identifier)
  const hashData = {
    occurrence_id: mapped.occurrence_id,
    process_number: mapped.process_number,
    opening_date: mapped.opening_date,
    agent_code: mapped.agent_code,
    occurrence_status: mapped.occurrence_status,
    service_number: mapped.service_number,
    expertise_costs: mapped.expertise_costs,
  };

  return { ...mapped, row_hash: computeRowHash(hashData) };
}
