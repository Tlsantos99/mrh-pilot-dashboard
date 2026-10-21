import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase/server';
import { detectFileType } from '@/lib/ingestion/detector';
import { processGlobalRow } from '@/lib/ingestion/processor-global';
import { processPilotoRow } from '@/lib/ingestion/processor-piloto';
import { processAntigoRow } from '@/lib/ingestion/processor-antigo';
import { processAgentesRow } from '@/lib/ingestion/processor-agentes';
import { processServiceReportRows } from '@/lib/ingestion/processor-service-report';
import { transformOccurrences, syncAgentsFromStaging } from '@/lib/transform/occurrences';
import type { FileType } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 500;

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  let storagePath: string | null = null;

  try {
    const body = await req.json() as {
      storagePath: string;
      filename: string;
      fileType?: FileType;
      fileHash: string;
    };

    storagePath = body.storagePath;
    const { filename, fileType: manualType, fileHash } = body;

    // Check duplicate
    const { data: existing } = await supabase
      .from('upload_history')
      .select('id, status')
      .eq('file_hash', fileHash)
      .single();

    if (existing) {
      await supabase.storage.from('temp-uploads').remove([storagePath]);
      return NextResponse.json({ status: 'duplicate', message: 'Este ficheiro já foi importado anteriormente.', uploadId: existing.id });
    }

    // Download from Storage
    const { data: fileData, error: dlErr } = await supabase.storage.from('temp-uploads').download(storagePath);
    if (dlErr || !fileData) {
      return NextResponse.json({ error: 'Falha ao descarregar ficheiro do Storage', detail: dlErr?.message }, { status: 500 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Parse XLSX
    const isServiceReport = /^Service Performance Report/i.test(filename);
    const isChamadas = filename.toLowerCase().includes('chamadas');

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    let sheetName = workbook.SheetNames[0];
    if (isChamadas) sheetName = workbook.SheetNames.find(s => s.includes('OneReport') || s.includes('Simplificado')) ?? sheetName;
    if (isServiceReport) sheetName = workbook.SheetNames[1] ?? sheetName;

    const sheet = workbook.Sheets[sheetName];

    let rawData: Record<string, unknown>[];
    if (isServiceReport) {
      const allArrays = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
      rawData = allArrays.slice(5).map(row => Object.fromEntries((row as unknown[]).map((v, i) => [String(i), v])));
    } else {
      const headerRow = isChamadas ? 3 : 0;
      rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null, range: headerRow });
    }

    const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
    const fileType: FileType = manualType ?? detectFileType(filename, headers).fileType ?? 'global';

    // Create upload record
    const { data: uploadRecord, error: uploadErr } = await supabase
      .from('upload_history')
      .insert({ filename, file_type: fileType, file_hash: fileHash, rows_received: rawData.length, status: 'processing' })
      .select('id')
      .single();

    if (uploadErr || !uploadRecord) {
      return NextResponse.json({ error: 'Erro ao criar registo de upload', detail: uploadErr?.message }, { status: 500 });
    }

    const uploadId = uploadRecord.id;
    let inserted = 0;
    let rejected = 0;

    if (fileType === 'chamadas_summary') {
      const aggRows = processServiceReportRows(rawData, uploadId);
      for (let i = 0; i < aggRows.length; i += BATCH_SIZE) {
        const batch = aggRows.slice(i, i + BATCH_SIZE);
        const { data: upserted, error } = await supabase.from('calls_daily_agg').upsert(batch, { onConflict: 'call_date', ignoreDuplicates: false }).select('id');
        if (error) rejected += batch.length;
        else inserted += upserted?.length ?? batch.length;
      }
    } else {
      const tableMap: Record<string, string> = {
        global: 'staging_global', piloto: 'staging_piloto_agentes',
        antigo: 'staging_formulario_antigo', agentes: 'staging_agentes', chamadas: 'staging_chamadas',
      };
      const tableName = tableMap[fileType];

      const processedRows: Record<string, unknown>[] = [];
      for (let i = 0; i < rawData.length; i++) {
        try {
          let processed: Record<string, unknown>;
          switch (fileType) {
            case 'global':   processed = processGlobalRow(rawData[i], uploadId, i + 1); break;
            case 'piloto':   processed = processPilotoRow(rawData[i], uploadId, i + 1); break;
            case 'antigo':   processed = processAntigoRow(rawData[i], uploadId, i + 1); break;
            case 'agentes':  processed = processAgentesRow(rawData[i], uploadId, i + 1); break;
            default: rejected++; continue;
          }
          processedRows.push(processed);
        } catch { rejected++; }
      }

      for (let i = 0; i < processedRows.length; i += BATCH_SIZE) {
        const batch = processedRows.slice(i, i + BATCH_SIZE);
        const { data: upserted, error } = await supabase.from(tableName).upsert(batch, { onConflict: 'row_hash', ignoreDuplicates: true }).select('id');
        if (error) rejected += batch.length;
        else inserted += upserted?.length ?? batch.length;
      }

      if (fileType === 'agentes') {
        try { await syncAgentsFromStaging(); } catch {}
      }

      if (['global', 'piloto', 'antigo', 'agentes'].includes(fileType)) {
        try {
          if (fileType === 'global') {
            await transformOccurrences(uploadId);
          } else if (fileType === 'antigo') {
            const { data: oids } = await supabase.from('staging_formulario_antigo').select('occurrence_id').eq('upload_id', uploadId).not('occurrence_id', 'is', null);
            const ids = Array.from(new Set((oids ?? []).map((r: { occurrence_id: string }) => r.occurrence_id).filter(Boolean)));
            if (ids.length > 0) await transformOccurrences(undefined, ids);
          } else if (fileType === 'piloto') {
            const { data: oids } = await supabase.from('staging_piloto_agentes').select('occurrence_id').eq('upload_id', uploadId).not('occurrence_id', 'is', null);
            const ids = Array.from(new Set((oids ?? []).map((r: { occurrence_id: string }) => r.occurrence_id).filter(Boolean)));
            if (ids.length > 0) await transformOccurrences(undefined, ids);
          }
        } catch (transformErr) {
          console.error('Transform error (non-blocking):', transformErr);
        }
      }
    }

    await supabase.from('upload_history').update({
      rows_inserted: inserted,
      rows_rejected: rejected,
      rows_updated: 0,
      status: rejected === rawData.length ? 'error' : inserted === 0 ? 'duplicate' : 'success',
    }).eq('id', uploadId);

    // Clean up temp file
    await supabase.storage.from('temp-uploads').remove([storagePath]);

    return NextResponse.json({ status: 'success', uploadId, fileType, rowsReceived: rawData.length, rowsInserted: inserted, rowsRejected: rejected });

  } catch (err) {
    console.error('process-storage error:', err);
    if (storagePath) {
      try { await createServerClient().storage.from('temp-uploads').remove([storagePath]); } catch {}
    }
    return NextResponse.json({ error: 'Erro interno', detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
