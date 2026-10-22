import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
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

// Extract a raw value from an ExcelJS cell (handles richText, formula, hyperlink)
function cellVal(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  const obj = v as Record<string, unknown>;
  if (Array.isArray(obj['richText'])) {
    return (obj['richText'] as Array<{ text?: string }>).map((r) => r.text ?? '').join('');
  }
  if ('formula' in obj) return obj['result'] ?? null;
  if ('error' in obj) return null;
  if ('text' in obj) return obj['text'];
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

async function parseWithExcelJS(buffer: Buffer, filename: string): Promise<Record<string, unknown>[]> {
  // Write to /tmp — ExcelJS streaming reads from file path
  const tmpPath = `/tmp/exj_${Date.now()}.xlsx`;
  writeFileSync(tmpPath, buffer);

  try {
    // Dynamic import so this large module isn't loaded for non-large-file routes
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpPath);

    const isServiceReport = /^Service Performance Report/i.test(filename);
    const isChamadas = filename.toLowerCase().includes('chamadas');

    let ws = wb.worksheets[0];
    if (isChamadas) {
      ws = wb.worksheets.find((s) => s.name.includes('OneReport') || s.name.includes('Simplificado')) ?? wb.worksheets[0];
    } else if (isServiceReport) {
      ws = wb.worksheets[1] ?? wb.worksheets[0];
    }

    if (!ws) throw new Error('Nenhuma worksheet encontrada');

    const rows: Record<string, unknown>[] = [];

    if (isServiceReport) {
      // Service report: no header row, use column index as key; skip first 5 rows
      ws.eachRow((row, rowNum) => {
        if (rowNum <= 5) return;
        const obj: Record<string, unknown> = {};
        (row.values as unknown[]).slice(1).forEach((v, i) => { obj[String(i)] = cellVal(v); });
        rows.push(obj);
      });
      return rows;
    }

    // All other types: first row = headers
    const headerRowNum = isChamadas ? 4 : 1;
    const headers: string[] = [];

    ws.eachRow((row, rowNum) => {
      const vals = (row.values as unknown[]).slice(1); // 1-indexed → 0-indexed

      if (rowNum === headerRowNum) {
        vals.forEach((v, i) => { headers[i] = String(cellVal(v) ?? ''); });
        return;
      }
      if (rowNum < headerRowNum || headers.length === 0) return;

      const obj: Record<string, unknown> = {};
      vals.forEach((v, i) => {
        const h = headers[i];
        if (h) obj[h] = cellVal(v);
      });
      rows.push(obj);
    });

    return rows;
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);

    const chunkIndex = parseInt(searchParams.get('chunkIndex') ?? '');
    const totalChunks = parseInt(searchParams.get('totalChunks') ?? '');
    const uploadToken = searchParams.get('uploadToken') ?? '';
    const filename = decodeURIComponent(searchParams.get('filename') ?? '');
    const fileType = (searchParams.get('fileType') ?? null) as FileType | null;
    const fileHash = searchParams.get('fileHash') ?? '';

    if (!uploadToken || isNaN(chunkIndex) || isNaN(totalChunks) || !filename || !fileHash) {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const chunkBuffer = Buffer.from(await req.arrayBuffer());

    // Duplicate check on first chunk only
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

    // Store chunk — service role key bypasses Storage RLS
    const chunkPath = `chunks/${uploadToken}/chunk_${String(chunkIndex).padStart(4, '0')}`;
    const { error: storeErr } = await supabase.storage
      .from('temp-uploads')
      .upload(chunkPath, chunkBuffer, { upsert: true, contentType: 'application/octet-stream' });

    if (storeErr) {
      return NextResponse.json({ error: `Erro ao guardar chunk ${chunkIndex}: ${storeErr.message}` }, { status: 500 });
    }

    if (chunkIndex < totalChunks - 1) {
      return NextResponse.json({ status: 'chunk_received', chunkIndex });
    }

    // Last chunk: assemble all chunks
    const allChunks: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const path = `chunks/${uploadToken}/chunk_${String(i).padStart(4, '0')}`;
      const { data: chunkData, error: dlErr } = await supabase.storage.from('temp-uploads').download(path);
      if (dlErr || !chunkData) {
        return NextResponse.json({ error: `Erro ao descarregar chunk ${i}: ${dlErr?.message ?? 'dados nulos'}` }, { status: 500 });
      }
      const buf = Buffer.from(await chunkData.arrayBuffer());
      if (buf.length === 0) {
        return NextResponse.json({ error: `Chunk ${i} vazio após download` }, { status: 500 });
      }
      allChunks.push(buf);
    }

    const fullBuffer = Buffer.concat(allChunks);

    // Cleanup chunks (fire and forget)
    const chunkPaths = Array.from({ length: totalChunks }, (_, i) =>
      `chunks/${uploadToken}/chunk_${String(i).padStart(4, '0')}`
    );
    supabase.storage.from('temp-uploads').remove(chunkPaths).catch(() => {});

    // Validate XLSX magic bytes (ZIP = PK)
    if (fullBuffer.length < 100 || fullBuffer[0] !== 0x50 || fullBuffer[1] !== 0x4B) {
      return NextResponse.json({
        error: `Buffer inválido. Tamanho: ${fullBuffer.length}b, início: ${fullBuffer.slice(0, 4).toString('hex')}`,
      }, { status: 500 });
    }

    // Parse with ExcelJS (streaming SAX parser — handles large files reliably)
    let rawData: Record<string, unknown>[];
    try {
      rawData = await parseWithExcelJS(fullBuffer, filename);
    } catch (parseErr) {
      return NextResponse.json({
        error: `Erro ao analisar ficheiro: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      }, { status: 500 });
    }

    if (rawData.length === 0) {
      return NextResponse.json({
        error: `Ficheiro não contém dados. Tamanho: ${fullBuffer.length}b`,
      }, { status: 500 });
    }

    const headers = Object.keys(rawData[0]);
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
        else inserted += upserted?.length ?? 0;
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

    const finalStatus = rejected === rawData.length ? 'error' : inserted === 0 ? 'duplicate' : 'success';

    await supabase.from('upload_history').update({
      rows_inserted: inserted,
      rows_rejected: rejected,
      rows_updated: 0,
      status: finalStatus,
    }).eq('id', uploadId);

    return NextResponse.json({
      status: finalStatus,
      uploadId,
      fileType: resolvedFileType,
      rowsReceived: rawData.length,
      rowsInserted: inserted,
      rowsRejected: rejected,
    });

  } catch (err) {
    console.error('chunk-raw error:', err);
    return NextResponse.json({ error: 'Erro interno', detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
