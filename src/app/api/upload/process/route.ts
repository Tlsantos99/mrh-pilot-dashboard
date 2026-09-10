import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase/server';
import { computeFileHash } from '@/lib/utils/hash';
import { detectFileType } from '@/lib/ingestion/detector';
import { validateFileStructure } from '@/lib/ingestion/validator';
import { processGlobalRow } from '@/lib/ingestion/processor-global';
import { processPilotoRow } from '@/lib/ingestion/processor-piloto';
import { processAntigoRow } from '@/lib/ingestion/processor-antigo';
import { processAgentesRow, buildAgentRecord } from '@/lib/ingestion/processor-agentes';
import { processChamadasRow } from '@/lib/ingestion/processor-chamadas';
import { processServiceReportRows } from '@/lib/ingestion/processor-service-report';
import { transformOccurrences, syncAgentsFromStaging } from '@/lib/transform/occurrences';
import type { FileType } from '@/types';

const BATCH_SIZE = 500;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const manualType = formData.get('fileType') as FileType | null;

    if (!file) return NextResponse.json({ error: 'Ficheiro não encontrado' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = computeFileHash(buffer);
    const supabase = createServerClient();

    // Check duplicate file
    const { data: existing } = await supabase
      .from('upload_history')
      .select('id, status')
      .eq('file_hash', fileHash)
      .single();

    if (existing) {
      return NextResponse.json({
        status: 'duplicate',
        message: 'Este ficheiro já foi importado anteriormente.',
        uploadId: existing.id,
      });
    }

    // Parse Excel
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

    // For chamadas: header is at row 4 (index 3)
    // Detect first to know if we need special header row
    const firstSheetName = workbook.SheetNames[0];
    let sheetName = firstSheetName;
    const isServiceReport = /^Service Performance Report/i.test(file.name);

    // For chamadas file, use specific sheet
    if (file.name.toLowerCase().includes('chamadas')) {
      sheetName = workbook.SheetNames.find(s => s.includes('OneReport') || s.includes('Simplificado')) ?? firstSheetName;
    }
    // For service report, use sheet 2 (index 1)
    if (isServiceReport) {
      sheetName = workbook.SheetNames[1] ?? firstSheetName;
    }

    const sheet = workbook.Sheets[sheetName];

    // Determine header row
    let headerRow = 0;
    const isChamadas = file.name.toLowerCase().includes('chamadas');
    if (isChamadas) headerRow = 3; // row 4 = index 3
    if (isServiceReport) headerRow = 4; // row 5 = index 4 (headers), data starts at row 6

    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: null,
      range: headerRow,
    });

    const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];

    // Detect file type
    const detection = detectFileType(file.name, headers);
    const fileType: FileType = manualType ?? detection.fileType ?? 'global';

    // Validate
    const validation = validateFileStructure(fileType, headers, rawData);
    if (!validation.valid && !manualType) {
      return NextResponse.json({
        status: 'error',
        message: `Validação falhou: ${validation.errors.join('; ')}`,
        errors: validation.errors,
      }, { status: 422 });
    }

    // Create upload history record
    const { data: uploadRecord, error: uploadErr } = await supabase
      .from('upload_history')
      .insert({
        filename: file.name,
        file_type: fileType,
        file_hash: fileHash,
        rows_received: rawData.length,
        status: 'processing',
      })
      .select('id')
      .single();

    if (uploadErr || !uploadRecord) {
      return NextResponse.json({
        error: 'Erro ao criar registo de upload',
        detail: uploadErr?.message ?? 'uploadRecord null',
      }, { status: 500 });
    }

    const uploadId = uploadRecord.id;
    let inserted = 0;
    let rejected = 0;

    // For chamadas_summary: process all rows at once (special logic)
    if (fileType === 'chamadas_summary') {
      const aggRows = processServiceReportRows(rawData, uploadId);
      for (let i = 0; i < aggRows.length; i += BATCH_SIZE) {
        const batch = aggRows.slice(i, i + BATCH_SIZE);
        const { data: upserted, error } = await supabase
          .from('calls_daily_agg')
          .upsert(batch, { onConflict: 'call_date,source_upload_id', ignoreDuplicates: true })
          .select('id');
        if (error) rejected += batch.length;
        else inserted += upserted?.length ?? batch.length;
      }

      await supabase.from('upload_history').update({
        rows_inserted: inserted,
        rows_rejected: rejected,
        rows_updated: 0,
        status: rejected === rawData.length ? 'error' : inserted === 0 ? 'duplicate' : 'success',
      }).eq('id', uploadId);

      return NextResponse.json({
        status: 'success',
        uploadId,
        fileType,
        rowsReceived: rawData.length,
        rowsInserted: inserted,
        rowsRejected: rejected,
      });
    }

    // Process rows in batches
    const processedRows: Record<string, unknown>[] = [];
    for (let i = 0; i < rawData.length; i++) {
      const raw = rawData[i];
      try {
        let processed: Record<string, unknown>;
        switch (fileType) {
          case 'global':   processed = processGlobalRow(raw, uploadId, i + 1); break;
          case 'piloto':   processed = processPilotoRow(raw, uploadId, i + 1); break;
          case 'antigo':   processed = processAntigoRow(raw, uploadId, i + 1); break;
          case 'agentes':  processed = processAgentesRow(raw, uploadId, i + 1); break;
          case 'chamadas': processed = processChamadasRow(raw, uploadId, i + 1); break;
          default: rejected++; continue;
        }
        processedRows.push(processed);
      } catch {
        rejected++;
      }
    }

    // Get staging table name
    const tableMap: Record<Exclude<FileType, 'chamadas_summary'>, string> = {
      global: 'staging_global',
      piloto: 'staging_piloto_agentes',
      antigo: 'staging_formulario_antigo',
      agentes: 'staging_agentes',
      chamadas: 'staging_chamadas',
    };
    const tableName = tableMap[fileType as Exclude<FileType, 'chamadas_summary'>];

    // Insert in batches (upsert by row_hash)
    for (let i = 0; i < processedRows.length; i += BATCH_SIZE) {
      const batch = processedRows.slice(i, i + BATCH_SIZE);
      const { data: upserted, error } = await supabase
        .from(tableName)
        .upsert(batch, { onConflict: 'row_hash', ignoreDuplicates: true })
        .select('id');

      if (error) {
        rejected += batch.length;
      } else {
        inserted += upserted?.length ?? batch.length;
      }
    }

    // For calls, also insert into calls table directly
    if (fileType === 'chamadas') {
      const callRows = processedRows.map(r => ({
        session_id: r.session_id,
        call_date: r.call_date,
        call_time: r.call_time,
        contact: r.contact,
        service: r.service,
        call_duration_minutes: r.call_duration_minutes,
        wait_time_minutes: r.wait_time_minutes,
        agent_name: r.agent_name,
        answered: r.answered,
        abandoned: r.abandoned,
        within_business_hours: r.within_business_hours,
        call_year: r.call_year,
        call_week: r.call_week,
        call_week_label: r.call_week_label,
        source_upload_id: uploadId,
      }));
      for (let i = 0; i < callRows.length; i += BATCH_SIZE) {
        await supabase.from('calls').upsert(callRows.slice(i, i + BATCH_SIZE), {
          onConflict: 'session_id,call_date,call_time,contact',
          ignoreDuplicates: true,
        });
      }
    }

    // If agentes, sync to agents reference table
    if (fileType === 'agentes') {
      try {
        await syncAgentsFromStaging();
      } catch (syncErr) {
        console.error('Agent sync error (non-blocking):', syncErr);
      }
    }

    // Rows that were silently skipped by ON CONFLICT DO NOTHING
    const skipped = processedRows.length - inserted - Math.max(0, rejected - (rawData.length - processedRows.length));

    // Update upload history
    await supabase.from('upload_history').update({
      rows_inserted: inserted,
      rows_rejected: rejected,
      rows_updated: Math.max(0, skipped), // re-used field: "already existed / ignored by dedup"
      status: rejected === rawData.length ? 'error' : inserted === 0 ? 'duplicate' : 'success',
    }).eq('id', uploadId);

    // Trigger transform for types that affect occurrences
    if (['global', 'piloto', 'antigo', 'agentes'].includes(fileType)) {
      try {
        await transformOccurrences(uploadId);
      } catch (transformErr) {
        console.error('Transform error (non-blocking):', transformErr);
      }
    }

    return NextResponse.json({
      status: 'success',
      uploadId,
      fileType,
      rowsReceived: rawData.length,
      rowsInserted: inserted,
      rowsRejected: rejected,
    });

  } catch (err) {
    console.error('Upload process error:', err);
    return NextResponse.json({
      error: 'Erro interno no processamento do ficheiro',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
