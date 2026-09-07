import type { FileType } from '@/types';
import { getRequiredColumns } from './detector';

export interface ValidationSummary {
  valid: boolean;
  errors: string[];
  warnings: string[];
  rowCount: number;
  missingColumns: string[];
}

export function validateFileStructure(
  fileType: FileType,
  headers: string[],
  rows: Record<string, unknown>[]
): ValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedHeaders = headers.map(h => h?.toString().trim());

  // Check required columns
  const required = getRequiredColumns(fileType);
  const missingColumns = required.filter(
    col => !normalizedHeaders.some(h => h === col || h?.toLowerCase() === col.toLowerCase())
  );

  if (missingColumns.length > 0) {
    errors.push(`Colunas obrigatórias em falta: ${missingColumns.join(', ')}`);
  }

  if (rows.length === 0) {
    errors.push('Ficheiro sem dados (0 linhas)');
  }

  if (rows.length > 500000) {
    warnings.push(`Ficheiro muito grande (${rows.length} linhas) — o processamento pode demorar`);
  }

  // Type-specific validations
  if (fileType === 'global') {
    const sample = rows.slice(0, 100);
    const emptyOccurrence = sample.filter(r => !r['Ocorrência'] && !r['Ocorrencia']).length;
    if (emptyOccurrence > sample.length * 0.5) {
      warnings.push('Mais de 50% das amostras sem campo Ocorrência');
    }
  }

  if (fileType === 'chamadas') {
    warnings.push('Verificar que o header está na linha 4 do ficheiro original');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rowCount: rows.length,
    missingColumns,
  };
}
