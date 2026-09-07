import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase/server';
import { computeFileHash, computeRowHash } from '@/lib/utils/hash';
import { detectFileType } from '@/lib/ingestion/detector';
import { validateFileStructure } from '@/lib/ingestion/validator';
import type { FileType } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const manualType = formData.get('fileType') as FileType | null;

    if (!file) return NextResponse.json({ error: 'Ficheiro não encontrado' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = computeFileHash(buffer);
    const supabase = createServerClient();

    // Check if file already imported
    const { data: existing } = await supabase
      .from('upload_history')
      .select('id, status, upload_timestamp')
      .eq('file_hash', fileHash)
      .single();

    if (existing) {
      return NextResponse.json({
        isDuplicateFile: true,
        fileHash,
        filename: file.name,
        previousUpload: existing,
        ready: false,
        errors: ['Este ficheiro já foi importado anteriormente.'],
        warnings: [],
        rowsFound: 0,
        rowsNew: 0,
        rowsDuplicate: 0,
      });
    }

    // Parse Excel
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const isChamadas = file.name.toLowerCase().includes('chamadas');
    const firstSheetName = workbook.SheetNames[0];
    const sheetName = isChamadas
      ? (workbook.SheetNames.find(s => s.includes('OneReport')) ?? firstSheetName)
      : firstSheetName;

    const sheet = workbook.Sheets[sheetName];
    const headerRow = isChamadas ? 3 : 0;

    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: null,
      range: headerRow,
    });

    const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
    const detection = detectFileType(file.name, headers);
    const fileType: FileType = manualType ?? detection.fileType ?? 'global';

    const validation = validateFileStructure(fileType, headers, rawData);

    // Check for row-level duplicates against staging
    const tableMap: Record<FileType, string> = {
      global: 'staging_global',
      piloto: 'staging_piloto_agentes',
      antigo: 'staging_formulario_antigo',
      agentes: 'staging_agentes',
      chamadas: 'staging_chamadas',
    };

    // Sample row hashes to estimate duplicates
    const sampleHashes = rawData.slice(0, 200).map(row =>
      computeRowHash(row as Record<string, unknown>)
    );

    const { data: existingRows } = await supabase
      .from(tableMap[fileType])
      .select('row_hash')
      .in('row_hash', sampleHashes);

    const existingHashSet = new Set((existingRows ?? []).map(r => r.row_hash));
    const sampleDuplicates = sampleHashes.filter(h => existingHashSet.has(h)).length;
    const estimatedDuplicateRate = sampleHashes.length > 0 ? sampleDuplicates / sampleHashes.length : 0;
    const estimatedDuplicates = Math.round(rawData.length * estimatedDuplicateRate);
    const estimatedNew = rawData.length - estimatedDuplicates;

    return NextResponse.json({
      isDuplicateFile: false,
      fileHash,
      filename: file.name,
      fileType,
      detected: detection.confidence !== 'none',
      detectionConfidence: detection.confidence,
      detectionReason: detection.reason,
      rowsFound: rawData.length,
      rowsNew: estimatedNew,
      rowsDuplicate: estimatedDuplicates,
      errors: validation.errors,
      warnings: validation.warnings,
      ready: validation.valid,
      headers: headers.slice(0, 10),
    });

  } catch (err) {
    return NextResponse.json({
      error: 'Erro ao validar ficheiro',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
