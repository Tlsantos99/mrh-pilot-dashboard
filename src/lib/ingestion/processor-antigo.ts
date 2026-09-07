import { parsePTDashDatetime, parseNumeric } from '@/lib/utils/dates';
import { computeRowHash } from '@/lib/utils/hash';

type RawRow = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

export function processAntigoRow(raw: RawRow, uploadId: string, sourceRow: number) {
  const mapped = {
    upload_id: uploadId,
    ano_mes_encerramento: str(raw['Ano / Mês Encerramento']),
    id_sr: str(raw['Id_SR']),
    tipo_pedido: str(raw['Tipo Pedido']),
    area: str(raw['Área']),
    departamento: str(raw['Departamento']),
    ramo: str(raw['Ramo']),
    aplicacao_origem: str(raw['Aplicação Origem']),
    categoria: str(raw['Categoria']),
    tarefa: str(raw['Tarefa']),
    sub_tarefa: str(raw['Sub Tarefa']),
    operacao: str(raw['Operação']),
    policy_number: str(raw['Nº Apólice SR']),
    occurrence_id: str(raw['Nº Sinistro SR']),  // KEY FIELD
    data_primeiro_estado: parsePTDashDatetime(str(raw['Data Primeiro Estado Em Curso']))?.toISOString() ?? null,
    data_encerramento: parsePTDashDatetime(str(raw['Data Encerramento']))?.toISOString() ?? null,
    nivel_servico: str(raw['Nível Serviço']),
    dias_uteis: parseNumeric(raw['Nº Dias Uteis']),
    origem_reclamacao: str(raw['Origem Reclamação']),
    nif: str(raw['NIF']),
    tipo_cliente: str(raw['Tipo Cliente']),
    canal_i: str(raw['Canal_I']),
    canal_ii: str(raw['Canal_II']),
    canal_iii: str(raw['Canal_III']),
    agent_code: str(raw['Código Agente']),
    source_row: sourceRow,
  };

  const hashData = {
    id_sr: mapped.id_sr,
    occurrence_id: mapped.occurrence_id,
    agent_code: mapped.agent_code,
  };

  return { ...mapped, row_hash: computeRowHash(hashData) };
}
