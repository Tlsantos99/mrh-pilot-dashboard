'use client';
import { useState, useCallback } from 'react';
import UploadHistory from '@/components/upload/UploadHistory';
import type { FileType } from '@/types';

const LARGE_FILE_THRESHOLD = 3 * 1024 * 1024; // 3 MB → bypass server validate, use chunked upload
const CHUNK_SIZE = 1000; // rows per API call

function quickDetectType(filename: string): FileType | null {
  const f = filename.replace(/.*[/\\]/, '');
  if (/^FicheiroGlobal/i.test(f)) return 'global';
  if (/^Report_|^Agregador_Piloto/i.test(f)) return 'piloto';
  if (/^Participaç/i.test(f)) return 'antigo';
  if (/^Agentes_Piloto/i.test(f)) return 'agentes';
  if (/^Chamadas/i.test(f)) return 'chamadas';
  return null;
}

interface ValidationResult {
  isDuplicateFile?: boolean;
  fileType?: string;
  detected?: boolean;
  rowsFound?: number;
  rowsNew?: number;
  rowsDuplicate?: number;
  errors?: string[];
  warnings?: string[];
  ready?: boolean;
  fileHash?: string;
  previousUpload?: { upload_timestamp: string };
  error?: string;   // API-level error (catch block)
  detail?: string;  // Technical error detail
}

interface ProcessResult {
  status: string;
  rowsReceived?: number;
  rowsInserted?: number;
  rowsRejected?: number;
  message?: string;
  error?: string;
  detail?: string;
}

const FILE_TYPE_LABELS: Record<FileType, string> = {
  global: 'Ficheiro Global',
  piloto: 'Piloto Agentes (Report_*)',
  antigo: 'Participações Formulário Antigo',
  agentes: 'Agentes e Waves',
  chamadas: 'Chamadas Linha Agentes',
};

export default function DataManagementPage() {
  const [file, setFile] = useState<File | null>(null);
  const [manualType, setManualType] = useState<FileType | ''>('');
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [isLargeFile, setIsLargeFile] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number; phase: 'parsing' | 'uploading' } | null>(null);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setValidation(null);
    setResult(null);
    setIsLargeFile(false);

    if (f.size > LARGE_FILE_THRESHOLD) {
      // Large file: parse headers client-side (avoid 413 on validate endpoint)
      setIsLargeFile(true);
      setValidating(true);
      try {
        const XLSX = await import('xlsx');
        const uint8 = new Uint8Array(await f.arrayBuffer());
        const wb = XLSX.read(uint8, { type: 'array', cellDates: false });
        const isChamadas = f.name.toLowerCase().includes('chamadas');
        const sheetName = isChamadas
          ? (wb.SheetNames.find((s: string) => s.includes('OneReport')) ?? wb.SheetNames[0])
          : wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        if (!sheet?.['!ref']) throw new Error('Folha sem dados');
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const headerRow = isChamadas ? 3 : 0;
        const totalRows = Math.max(0, range.e.r - headerRow);
        const detectedType = (manualType || quickDetectType(f.name)) as FileType | null;
        const sizeMB = (f.size / 1024 / 1024).toFixed(1);
        setValidation({
          fileType: detectedType ?? undefined,
          rowsFound: totalRows,
          rowsNew: totalRows,
          rowsDuplicate: 0,
          ready: !!detectedType,
          errors: detectedType ? [] : ['Tipo não identificado — seleciona manualmente.'],
          warnings: [`Ficheiro grande (${sizeMB} MB) — será importado por chunks (~${Math.ceil(totalRows / CHUNK_SIZE)} chamadas API).`],
        });
      } catch (e) {
        setValidation({ errors: [`Erro ao ler ficheiro: ${e instanceof Error ? e.message : String(e)}`], ready: false });
      } finally {
        setValidating(false);
      }
      return;
    }

    // Small file: server-side validate
    setValidating(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      if (manualType) fd.append('fileType', manualType);

      const res = await fetch('/api/upload/validate', { method: 'POST', body: fd });
      let data: ValidationResult;
      try {
        data = await res.json();
      } catch {
        data = { errors: [`Erro de rede ou timeout (HTTP ${res.status}). O ficheiro pode ser demasiado grande ou o servidor demorou demasiado.`], ready: false };
      }
      if (data.error && !data.errors?.length) {
        data = { ...data, errors: [data.error, ...(data.detail ? [`Detalhe: ${data.detail}`] : [])] };
      }
      setValidation(data);
    } catch (e) {
      setValidation({ errors: [`Erro de rede: ${e instanceof Error ? e.message : String(e)}`], ready: false });
    } finally {
      setValidating(false);
    }
  }, [manualType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleRegularImport = async () => {
    if (!file || !validation?.ready) return;
    setProcessing(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (manualType) fd.append('fileType', manualType);
      const res = await fetch('/api/upload/process', { method: 'POST', body: fd });
      const data = await res.json();
      setResult(data);
      if (data.status === 'success' || data.status === 'partial') {
        setHistoryKey(k => k + 1);
        setFile(null);
        setValidation(null);
      }
    } catch {
      setResult({ status: 'error', message: 'Erro ao processar ficheiro.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleChunkedImport = async () => {
    if (!file || !validation?.ready) return;
    const fileType = (manualType || validation.fileType) as FileType;
    if (!fileType) return;
    setProcessing(true);
    setResult(null);
    setProgress({ sent: 0, total: 1, phase: 'parsing' });

    try {
      // Parse full file client-side
      const XLSX = await import('xlsx');
      const uint8 = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(uint8, { type: 'array', cellDates: false });
      const isChamadas = file.name.toLowerCase().includes('chamadas');
      const sheetName = isChamadas
        ? (wb.SheetNames.find((s: string) => s.includes('OneReport')) ?? wb.SheetNames[0])
        : wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const headerRow = isChamadas ? 3 : 0;
      const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: true, defval: null, range: headerRow,
      });

      const totalRows = allRows.length;
      const totalChunks = Math.ceil(totalRows / CHUNK_SIZE);
      let uploadId: string | null = null;
      let cumulativeInserted = 0;
      let cumulativeRejected = 0;

      setProgress({ sent: 0, total: totalChunks, phase: 'uploading' });

      for (let ci = 0; ci < totalChunks; ci++) {
        const chunkRows = allRows.slice(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE);
        const isLast = ci === totalChunks - 1;

        const res = await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            fileType,
            uploadId,
            rows: chunkRows,
            totalRows,
            isLast,
            cumulativeInserted,
            cumulativeRejected,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(err.error ?? `Chunk ${ci + 1} falhou`);
        }

        const data = await res.json();
        uploadId = data.uploadId;
        cumulativeInserted += data.inserted ?? 0;
        cumulativeRejected += data.rejected ?? 0;
        setProgress({ sent: ci + 1, total: totalChunks, phase: 'uploading' });
      }

      setResult({ status: 'success', rowsReceived: totalRows, rowsInserted: cumulativeInserted, rowsRejected: cumulativeRejected });
      setHistoryKey(k => k + 1);
      setFile(null);
      setValidation(null);
      setIsLargeFile(false);
    } catch (e) {
      setResult({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  const handleImport = isLargeFile ? handleChunkedImport : handleRegularImport;

  const reset = () => {
    setFile(null);
    setValidation(null);
    setResult(null);
    setManualType('');
    setIsLargeFile(false);
    setProgress(null);
  };

  return (
    <div className="space-y-8 max-w-3xl px-4 sm:px-6 py-6">
      <div>
        <h1 className="text-2xl font-bold text-[#00305E]">Gestão de Dados</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload e validação dos ficheiros de input</p>
      </div>

      {/* Tipo manual */}
      <div className="card p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tipo de ficheiro <span className="text-gray-400 font-normal">(opcional — detecção automática)</span>
        </label>
        <select
          value={manualType}
          onChange={e => setManualType(e.target.value as FileType | '')}
          className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00305E]"
        >
          <option value="">Detecção automática</option>
          {(Object.entries(FILE_TYPE_LABELS) as [FileType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      {!file && !result && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          className={`card border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            dragging ? 'border-[#00B4A0] bg-teal-50' : 'border-gray-200 hover:border-[#00305E] hover:bg-blue-50/30'
          }`}
        >
          <input
            type="file"
            id="fileInput"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <label htmlFor="fileInput" className="cursor-pointer">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#00305E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[#00305E]">Arrastar ficheiro ou clicar para selecionar</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv — máx. 50MB</p>
          </label>
        </div>
      )}

      {/* Validating */}
      {validating && (
        <div className="card p-8 text-center">
          <div className="animate-spin h-8 w-8 border-2 border-[#00305E] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">A validar {file?.name}...</p>
        </div>
      )}

      {/* Validation result */}
      {validation && !result && (
        <div className="card p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-800">{file?.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Tipo detectado:{' '}
                <span className="font-medium text-[#00305E]">
                  {validation.fileType ? FILE_TYPE_LABELS[validation.fileType as FileType] : 'Não identificado'}
                </span>
              </p>
            </div>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Remover
            </button>
          </div>

          {validation.isDuplicateFile ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-800">⚠ Ficheiro já importado</p>
              <p className="text-xs text-amber-600 mt-1">
                Importado em{' '}
                {validation.previousUpload?.upload_timestamp
                  ? new Date(validation.previousUpload.upload_timestamp).toLocaleString('pt-PT')
                  : '—'}
              </p>
            </div>
          ) : (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Linhas encontradas', value: validation.rowsFound ?? 0, color: 'text-gray-700' },
                  { label: 'Linhas novas', value: validation.rowsNew ?? 0, color: 'text-[#00B4A0]' },
                  { label: 'Duplicados', value: validation.rowsDuplicate ?? 0, color: 'text-gray-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString('pt-PT')}</p>
                  </div>
                ))}
              </div>

              {/* Errors */}
              {(validation.errors ?? []).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  {(validation.errors ?? []).map((e, i) => (
                    <p key={i} className="text-xs text-red-700">✕ {e}</p>
                  ))}
                  {validation.detail && (
                    <p className="text-xs text-red-400 font-mono mt-1 break-all">Detalhe técnico: {validation.detail}</p>
                  )}
                </div>
              )}

              {/* Warnings */}
              {(validation.warnings ?? []).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                  {(validation.warnings ?? []).map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
                  ))}
                </div>
              )}

              {/* Progress bar (large file chunked upload) */}
              {progress && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{progress.phase === 'parsing' ? 'A carregar e analisar ficheiro...' : `Chunk ${progress.sent} / ${progress.total}`}</span>
                    <span>{progress.phase === 'uploading' ? `${Math.round((progress.sent / progress.total) * 100)}%` : ''}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-[#00B4A0] rounded-full transition-all duration-300"
                      style={{ width: progress.phase === 'parsing' ? '5%' : `${Math.round((progress.sent / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Status + action */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  {validation.ready ? (
                    <span className="text-sm font-medium text-green-700">✓ Pronto para importar</span>
                  ) : (
                    <span className="text-sm font-medium text-red-600">✕ Não é possível importar</span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={reset} disabled={processing} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40">
                    Cancelar
                  </button>
                  {validation.ready && (
                    <button
                      onClick={handleImport}
                      disabled={processing}
                      className="px-5 py-2 text-sm font-medium text-white bg-[#00305E] rounded-lg hover:bg-[#004080] disabled:opacity-50 transition"
                    >
                      {processing
                        ? (progress?.phase === 'parsing' ? 'A analisar...' : `Chunk ${progress?.sent ?? 0}/${progress?.total ?? '?'}...`)
                        : 'Importar'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`card p-6 border-l-4 ${
          result.status === 'success' ? 'border-l-green-500' :
          result.status === 'duplicate' ? 'border-l-amber-500' : 'border-l-red-500'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-gray-800">
              {result.status === 'success' ? '✓ Importação concluída' :
               result.status === 'duplicate' ? '⚠ Ficheiro duplicado' : '✕ Erro na importação'}
            </p>
            <div className="flex gap-2">
              {result.status === 'success' && (
                <a href="/dashboard" className="px-4 py-1.5 text-sm font-medium text-[#00305E] border border-[#00305E] rounded-lg hover:bg-blue-50 transition">
                  Ver dashboard ↗
                </a>
              )}
              <button onClick={reset} className="px-4 py-1.5 text-sm font-medium text-white bg-[#00305E] rounded-lg hover:bg-[#004080]">
                Novo upload
              </button>
            </div>
          </div>
          {result.status === 'success' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Recebidas', value: result.rowsReceived ?? 0 },
                  { label: 'Inseridas', value: result.rowsInserted ?? 0, color: 'text-green-700' },
                  { label: 'Rejeitadas', value: result.rowsRejected ?? 0, color: (result.rowsRejected ?? 0) > 0 ? 'text-red-600' : 'text-gray-400' },
                ].map(({ label, value, color = 'text-gray-700' }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{value.toLocaleString('pt-PT')}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Os dados do dashboard atualizam quando navegares para lá — não precisas de fazer refresh manual.
              </p>
            </>
          )}
          {(result.message || result.error) && (
            <p className="text-sm text-gray-500 mt-2">{result.message ?? result.error}</p>
          )}
          {result.detail && (
            <p className="text-xs text-red-500 mt-1 font-mono">{result.detail}</p>
          )}
        </div>
      )}

      {/* Upload History */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-[#00305E] mb-4">Histórico de Uploads</h2>
        <UploadHistory key={historyKey} />
      </div>
    </div>
  );
}
