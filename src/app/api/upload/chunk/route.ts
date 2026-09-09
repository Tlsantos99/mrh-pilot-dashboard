import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { processGlobalRow } from '@/lib/ingestion/processor-global';
import { processPilotoRow } from '@/lib/ingestion/processor-piloto';
import { processAntigoRow } from '@/lib/ingestion/processor-antigo';
import { processAgentesRow } from '@/lib/ingestion/processor-agentes';
import { processChamadasRow } from '@/lib/ingestion/processor-chamadas';
import { transformOccurrences, syncAgentsFromStaging } from '@/lib/transform/occurrences';
import type { FileType } from '@/types';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 500;

interface ChunkRequest {
  filename: string;
  fileType: FileType;
  fileHash?: string;
  uploadId: string | null;
  rows: Record<string, unknown>[];
  totalRows: number;
  isLast: boolean;
  cumulativeInserted: number;
  cumulativeRejected: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ChunkRequest;
    const { filename, fileType, fileHash, rows, totalRows, isLast, cumulativeInserted, cumulativeRejected } = body;
    let { uploadId } = body;
    const supabase = createServerClient();

    // First chunk: create upload_history record
    if (!uploadId) {
      const { data: rec, error } = await supabase
        .from('upload_history')
        .insert({ filename, file_type: fileType, file_hash: fileHash ?? filename, rows_received: totalRows, status: 'processing' })
        .select('id')
        .single();
      if (error || !rec) throw new Error(error?.message ?? 'Cannot create upload record');
      uploadId = rec.id as string;
    }

    // Process rows through type-specific processor
    let inserted = 0;
    let rejected = 0;
    const processedRows: Record<string, unknown>[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        let processed: Record<string, unknown>;
        switch (fileType) {
          case 'global':   processed = processGlobalRow(rows[i], uploadId!, i + 1); break;
          case 'piloto':   processed = processPilotoRow(rows[i], uploadId!, i + 1); break;
          case 'antigo':   processed = processAntigoRow(rows[i], uploadId!, i + 1); break;
          case 'agentes':  processed = processAgentesRow(rows[i], uploadId!, i + 1); break;
          case 'chamadas': processed = processChamadasRow(rows[i], uploadId!, i + 1); break;
          default: rejected++; continue;
        }
        processedRows.push(processed);
      } catch {
        rejected++;
      }
    }

    // Upsert to staging table (dedup by row_hash)
    const tableMap: Record<FileType, string> = {
      global: 'staging_global',
      piloto: 'staging_piloto_agentes',
      antigo: 'staging_formulario_antigo',
      agentes: 'staging_agentes',
      chamadas: 'staging_chamadas',
    };

    for (let i = 0; i < processedRows.length; i += BATCH_SIZE) {
      const batch = processedRows.slice(i, i + BATCH_SIZE);
      const { data: upserted, error } = await supabase
        .from(tableMap[fileType])
        .upsert(batch, { onConflict: 'row_hash', ignoreDuplicates: true })
        .select('id');
      if (error) rejected += batch.length;
      else inserted += upserted?.length ?? batch.length;
    }

    // Chamadas: also upsert into calls table
    if (fileType === 'chamadas') {
      const callRows = processedRows.map(r => ({
        session_id: r.session_id, call_date: r.call_date, call_time: r.call_time,
        contact: r.contact, service: r.service,
        call_duration_minutes: r.call_duration_minutes, wait_time_minutes: r.wait_time_minutes,
        agent_name: r.agent_name, answered: r.answered, abandoned: r.abandoned,
        within_business_hours: r.within_business_hours,
        call_year: r.call_year, call_week: r.call_week, call_week_label: r.call_week_label,
        source_upload_id: uploadId,
      }));
      for (let i = 0; i < callRows.length; i += BATCH_SIZE) {
        await supabase.from('calls').upsert(callRows.slice(i, i + BATCH_SIZE), {
          onConflict: 'session_id,call_date,call_time,contact', ignoreDuplicates: true,
        });
      }
    }

    // Last chunk: finalize history + trigger transform
    if (isLast) {
      if (fileType === 'agentes') {
        try { await syncAgentsFromStaging(); } catch (e) {
          console.error('Agent sync error:', e);
        }
      }

      const finalInserted = cumulativeInserted + inserted;
      const finalRejected = cumulativeRejected + rejected;
      const skipped = Math.max(0, totalRows - finalInserted - finalRejected);

      await supabase.from('upload_history').update({
        rows_inserted: finalInserted,
        rows_rejected: finalRejected,
        rows_updated: skipped,
        status: finalInserted === 0 && finalRejected < totalRows ? 'duplicate' : 'success',
      }).eq('id', uploadId);

      if (['global', 'piloto', 'antigo', 'agentes'].includes(fileType)) {
        try { await transformOccurrences(uploadId!); } catch (e) {
          console.error('Transform error (non-blocking):', e);
        }
      }

      return NextResponse.json({
        uploadId, inserted, rejected, done: true,
        totalInserted: finalInserted, totalRejected: finalRejected,
      });
    }

    return NextResponse.json({ uploadId, inserted, rejected, done: false });
  } catch (err) {
    console.error('Chunk error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
