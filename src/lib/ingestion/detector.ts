import type { FileType } from '@/types';

interface DetectionResult {
  fileType: FileType | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

const REQUIRED_COLUMNS: Record<FileType, string[]> = {
  global: ['Ocorrência', 'Número Processo', 'Código Agente', 'Data Abertura Ocorrência'],
  piloto: ['NUMERO_PEDIDO_INTERNO', 'Ocorrência', 'DATA_PEDIDO'],
  antigo: ['Nº Sinistro SR', 'Id_SR'],
  agentes: ['Código Agente', 'Wave', 'ASF Agregador'],
  chamadas: ['Session ID', 'Atendida', 'Abandonada', 'Duração da Chamada'],
  chamadas_summary: [],
};

const FILENAME_PATTERNS: Array<{ pattern: RegExp; type: FileType }> = [
  { pattern: /^Service Performance Report/i, type: 'chamadas_summary' },
  { pattern: /^Report_/i, type: 'piloto' },
  { pattern: /^Agregador_Piloto/i, type: 'piloto' },
  { pattern: /^FicheiroGlobal/i, type: 'global' },
  { pattern: /^Participações/i, type: 'antigo' },
  { pattern: /^Agentes_Piloto/i, type: 'agentes' },
  { pattern: /Cód Agentes/i, type: 'agentes' },
  { pattern: /^Chamadas/i, type: 'chamadas' },
];

export function detectFileType(filename: string, headers: string[]): DetectionResult {
  // 1. Try filename pattern first
  const filenameLower = filename.replace(/.*[\\/]/, ''); // strip path
  for (const { pattern, type } of FILENAME_PATTERNS) {
    if (pattern.test(filenameLower)) {
      return { fileType: type, confidence: 'high', reason: `Nome do ficheiro corresponde ao padrão ${type}` };
    }
  }

  // 2. Try column matching
  const normalizedHeaders = headers.map(h => h?.toString().trim());

  for (const [type, required] of Object.entries(REQUIRED_COLUMNS) as [FileType, string[]][]) {
    const matched = required.filter(col =>
      normalizedHeaders.some(h => h === col || h?.toLowerCase() === col.toLowerCase())
    );
    if (matched.length === required.length) {
      return { fileType: type, confidence: 'medium', reason: `Colunas correspondentes a ${type}` };
    }
    if (matched.length >= Math.ceil(required.length * 0.7)) {
      return { fileType: type, confidence: 'low', reason: `Colunas parcialmente correspondentes a ${type}` };
    }
  }

  return { fileType: null, confidence: 'none', reason: 'Não foi possível identificar o tipo' };
}

export function getRequiredColumns(fileType: FileType): string[] {
  return REQUIRED_COLUMNS[fileType] ?? [];
}
