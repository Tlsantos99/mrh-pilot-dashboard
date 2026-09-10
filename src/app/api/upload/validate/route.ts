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

    // Parse Excel — lazy: only read headers + row count, avoid parsing all cells
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const isChamadas = file.name.toLowerCase().includes('chamadas');
    const isServiceReport = /^Service Performance Report/i.test(file.name);
    const firstSheetName = workbook.SheetNames[0];
    let sheetName = isChamadas
      ? (workbook.SheetNames.find(s => s.includes('OneReport')) ?? firstSheetName)
      : firstSheetName;
    if (isServiceReport) sheetName = workbook.SheetNames[1] ?? firstSheetName;

    const sheet = workbook.Sheets[sheetName];
    const headerRow = isChamadas ? 3 : isServiceReport ? 4 : 0;

    if (!sheet || !sheet['!ref']) {
      return NextResponse.json({
        isDuplicateFile: false,
        fileHash,
        filename: file.name,
        fileType: manualType ?? 'global',
        detected: false,
        rowsFound: 0, rowsNew: 0, rowsDuplicate: 0,
        errors: ['Ficheiro sem dados ou folha não encontrada.'],
        warnings: [],
        ready: false,
      });
    }

    // Count rows from sheet range (fast — no cell parsing)
    const sheetRange = XLSX.utils.decode_range(sheet['!ref']);
    const totalRows = Math.max(0, sheetRange.e.r - headerRow); // rows excluding header

    // Parse only first 5 rows to get headers (fast)
    const previewRange = {
      s: { r: headerRow, c: sheetRange.s.c },
      e: { r: Math.min(headerRow + 5, sheetRange.e.r), c: sheetRange.e.c },
    };
    const previewData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true, defval: null, range: previewRange,
    });
    const headers = previewData.length > 0 ? Object.keys(previewData[0]) : [];

    const detection = detectFileType(file.name, headers);
    const fileType: FileType = manualType ?? detection.fileType ?? 'global';

    // Validate using just headers + empty sample (structure check only)
    const validation = validateFileStructure(fileType, headers, totalRows === 0 ? [] : previewData);

    // Sample 200 scattered rows for dedup estimate
    const tableMap: Record<FileType, string> = {
      global: 'staging_global',
      piloto: 'staging_piloto_agentes',
      antigo: 'staging_formulario_antigo',
      agentes: 'staging_agentes',
      chamadas: 'staging_chamadas',
      chamadas_summary: 'calls_daily_agg',
    };

    let estimatedDuplicates = 0;
    if (totalRows > 0 && fileType !== 'chamadas_summary') {
      // Parse first 200 data rows only for dedup estimate (fast)
      const sampleRange = {
        s: { r: headerRow, c: sheetRange.s.c },
        e: { r: Math.min(headerRow + 200, sheetRange.e.r), c: sheetRange.e.c },
      };
      const sampleData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: true, defval: null, range: sampleRange,
      });
      const sampleHashes = sampleData.map(row => computeRowHash(row as Record<string, unknown>));

      if (sampleHashes.length > 0) {
        const { data: existingRows } = await supabase
          .from(tableMap[fileType])
          .select('row_hash')
          .in('row_hash', sampleHashes);

        const existingHashSet = new Set((existingRows ?? []).map(r => r.row_hash));
        const sampleDuplicates = sampleHashes.filter(h => existingHashSet.has(h)).length;
        const rate = sampleDuplicates / sampleHashes.length;
        estimatedDuplicates = Math.round(totalRows * rate);
      }
    }

    return NextResponse.json({
      isDuplicateFile: false,
      fileHash,
      filename: file.name,
      fileType,
      detected: detection.confidence !== 'none',
      detectionConfidence: detection.confidence,
      detectionReason: detection.reason,
      rowsFound: totalRows,
      rowsNew: totalRows - estimatedDuplicates,
      rowsDuplicate: estimatedDuplicates,
      errors: validation.errors,
      warnings: validation.warnings,
      ready: validation.valid && totalRows > 0,
      headers: headers.slice(0, 10),
    });

  } catch (err) {
    return NextResponse.json({
      error: 'Erro ao validar ficheiro',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
