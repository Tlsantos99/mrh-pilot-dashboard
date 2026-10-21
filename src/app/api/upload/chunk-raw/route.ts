import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase/server';
import { detectFileType } from '@/lib/ingestion/detector';
import { processGlobalRow } from '@/lib/ingestion/processor-global';
import { processPilotoRow } from '@/lib/ingestion/processor-piloto';
import { processAntigoRow } from '@/lib/ingestion/processor-antigo';
import { processAgentesRow } from '@/lib/ingestion/processor-agentes';
import { transformOccurrences, syncAgentsFromStaging } from '@/lib/transform/occurrences';
import type { FileType } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 500;

// Sends each chunk as raw binary body (Content-Type: application/octet-stream)
// Metadata passed via query string to avoid multipart complexity
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);

    const chunkIndex = parseInt(searchParams.get('chunkIndex') ?? '');
    const totalChunks = parseInt(searchParams.get('totalChunks') ?? '');
    const uploadToken = searchParams.get('uploadToken') ?? '';
    const filename = searchParams.get('filename') ?? '';
    const fileType = (searchParams.get('fileType') ?? null) as FileType | null;
    const fileHash = searchParams.get('fileHash') ?? '';

    if (!uploadToken || isNaN(chunkIndex) || isNaN(totalChunks) || !filename || !fileHash) {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    // Read raw binary body
    const chunkBuffer = Buffer.from(await req.arrayBuffer());

    // Check duplicate on first chunk only
    if (chunkIndex === 0) {
      const { data: existing } = await supabase
        .from('upload_history')
        .select('id, status')
        .eq('file_hash', fileHash)
        .single();
      if (existing) {
        return NextResponse.json({ status: 'duplicate', message: 'Este ficheiro já foi importado anteriormente.', uploadId: existing.id });
      }
    }

    // Store chunk using service role (bypasses Storage RLS)
    const chunkPath = `chunks/${uploadToken}/chunk_${String(chunkIndex).padStart(4, '0')}`;
    const { error: storeErr } = await supabase.storage
      .from('temp-uploads')
      .upload(chunkPath, chunkBuffer, { upsert: true, contentType: 'application/octet-stream' });

    if (storeErr) {
      return NextResponse.json({ error: `Erro ao guardar chunk: ${storeErr.message}` }, { status: 500 });
    }

    // If not last chunk, acknowledge and stop
    if (chunkIndex < totalChunks - 1) {
      return NextResponse.json({ status: 'chunk_received', chunkIndex });
    }

    // Last chunk: assemble all chunks
    const allChunks: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const path = `chunks/${uploadToken}/chunk_${String(i).padStart(4, '0')}`;
      const { data: chunkData, error: dlErr } = await supabase.storage.from('temp-uploads').download(path);
      if (dlErr || !chunkData) {
        return NextResponse.json({ error: `Erro ao reassemblar chunk ${i}: ${dlErr?.message ?? 'null'}` }, { status: 500 });
      }
      allChunks.push(Buffer.from(await chunkData.arrayBuffer()));
    }

    const fullBuffer = Buffer.concat(allChunks);

    // Clean up chunks (fire and forget)
    const chunkPaths = Array.from({ length: totalChunks }, (_, i) =>
      `chunks/${uploadToken}/chunk_${String(i).padStart(4, '0')}`
    );
    supabase.storage.from('temp-uploads').remove(chunkPaths).catch(() => {});

    // Parse XLSX server-side (Node.js handles large files without issue)
    const isServiceReport = /^Service Performance Report/i.test(filename);
    const isChamadas = filename.toLowerCase().includes('chamadas');
    const workbook = XLSX.read(fullBuffer, { type: 'buffer', cellDates: false });
    let sheetName = workbook.SheetNames[0];
    if (isChamadas) sheetName = workbook.SheetNames.find((s: string) => s.includes('OneReport') || s.includes('Simplificado')) ?? sheetName;
    if (isServiceReport) sheetName = workbook.SheetNames[1] ?? sheetName;
    const sheet = workbook.Sheets[sheetName];

    let rawData: Record<string, unknown>[];
    if (isServiceReport) {
      const allArrays = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
      rawData = allArrays.slice(5).map((row) => Object.fromEntries((row as unknown[]).map((v, i) => [String(i), v])));
    } else {
      rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null, range: isChamadas ? 3 : 0 });
    }

    const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
    const resolvedFileType: FileType = fileType ?? detectFileType(filename, headers).fileType ?? 'global';

    const { data: uploadRecord, error: uploadErr } = await supabase
      .from('upload_history')
      .insert({ filename, file_type: resolvedFileType, file_hash: fileHash, rows_received: rawData.length, status: 'processing' })
      .select('id')
      .single();

    if (uploadErr || !uploadRecord) {
      return NextResponse.json({ error: 'Erro ao criar registo de upload', detail: uploadErr?.message }, { status: 500 });
    }

    const uploadId = uploadRecord.id as string;
    let inserted = 0;
    let rejected = 0;

    const tableMap: Record<string, string> = {
      global: 'staging_global', piloto: 'staging_piloto_agentes',
      antigo: 'staging_formulario_antigo', agentes: 'staging_agentes', chamadas: 'staging_chamadas',
    };
    const tableName = tableMap[resolvedFileType];

    if (tableName) {
      const processedRows: Record<string, unknown>[] = [];
      for (let i = 0; i < rawData.length; i++) {
        try {
          let processed: Record<string, unknown>;
          switch (resolvedFileType) {
            case 'global':  processed = processGlobalRow(rawData[i], uploadId, i + 1); break;
            case 'piloto':  processed = processPilotoRow(rawData[i], uploadId, i + 1); break;
            case 'antigo':  processed = processAntigoRow(rawData[i], uploadId, i + 1); break;
            case 'agentes': processed = processAgentesRow(rawData[i], uploadId, i + 1); break;
            default: rejected++; continue;
          }
          processedRows.push(processed);
        } catch { rejected++; }
      }

      for (let i = 0; i < processedRows.length; i += BATCH_SIZE) {
        const batch = processedRows.slice(i, i + BATCH_SIZE);
        const { data: upserted, error } = await supabase
          .from(tableName)
          .upsert(batch, { onConflict: 'row_hash', ignoreDuplicates: true })
          .select('id');
        if (error) rejected += batch.length;
        else inserted += upserted?.length ?? batch.length;
      }

      if (resolvedFileType === 'agentes') {
        try { await syncAgentsFromStaging(); } catch {}
      }

      if (['global', 'piloto', 'antigo'].includes(resolvedFileType)) {
        try {
          if (resolvedFileType === 'global') {
            await transformOccurrences(uploadId);
          } else {
            const stagingTable = resolvedFileType === 'piloto' ? 'staging_piloto_agentes' : 'staging_formulario_antigo';
            const { data: oids } = await supabase.from(stagingTable).select('occurrence_id').eq('upload_id', uploadId).not('occurrence_id', 'is', null);
            const ids = Array.from(new Set((oids ?? []).map((r: { occurrence_id: string }) => r.occurrence_id).filter(Boolean)));
            if (ids.length > 0) await transformOccurrences(undefined, ids);
          }
        } catch (err) {
          console.error('Transform error:', err);
        }
      }
    }

    await supabase.from('upload_history').update({
      rows_inserted: inserted,
      rows_rejected: rejected,
      rows_updated: 0,
      status: rejected === rawData.length ? 'error' : inserted === 0 ? 'duplicate' : 'success',
    }).eq('id', uploadId);

    return NextResponse.json({ status: 'success', uploadId, fileType: resolvedFileType, rowsReceived: rawData.length, rowsInserted: inserted, rowsRejected: rejected });

  } catch (err) {
    console.error('chunk-raw error:', err);
    return NextResponse.json({ error: 'Erro interno', detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
