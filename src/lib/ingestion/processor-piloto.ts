import { parseUSDatetime } from '@/lib/utils/dates';
import { computeRowHash } from '@/lib/utils/hash';

type RawRow = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

export function processPilotoRow(raw: RawRow, uploadId: string, sourceRow: number) {
  const dataPedidoRaw = str(raw['DATA_PEDIDO']);
  const dataPedidoParsed = parseUSDatetime(dataPedidoRaw);

  const mapped = {
    upload_id: uploadId,
    numero_pedido_interno: str(raw['NUMERO_PEDIDO_INTERNO']),
    numero_pedido: str(raw['NUMERO_PEDIDO']),
    data_pedido_raw: dataPedidoRaw,
    data_pedido_parsed: dataPedidoParsed?.toISOString() ?? null,
    gp_sub_area: str(raw['GP_SUB_AREA']),
    gp_task: str(raw['GP_TASK']),
    gp_sub_task: str(raw['GP_SUB_TASK']),
    policy_number: str(raw['GP_POLICY_NUMBER']),
    mode: str(raw['Mode']),
    orchestrator_queue: str(raw['OrchestratorQueue']),
    orchestrator_folder: str(raw['OrchestratorFolder']),
    origem: str(raw['Origem']),
    prestador: str(raw['Prestador']),
    occurrence_id: str(raw['Ocorrência'] ?? raw['Ocorrencia']),
    status_output: str(raw['Status_Output_Record']),
    message_output: str(raw['Message_Output_Record']),
    source_row: sourceRow,
  };

  const hashData = {
    numero_pedido_interno: mapped.numero_pedido_interno,
    numero_pedido: mapped.numero_pedido,
    occurrence_id: mapped.occurrence_id,
    data_pedido_raw: mapped.data_pedido_raw,
  };

  return { ...mapped, row_hash: computeRowHash(hashData) };
}
