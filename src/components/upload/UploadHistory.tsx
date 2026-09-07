'use client';
import { useEffect, useState } from 'react';
import LoadingState from '@/components/ui/LoadingState';
import type { UploadHistory as UH } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  global: 'Ficheiro Global',
  piloto: 'Piloto Agentes',
  antigo: 'Form. Antigo',
  agentes: 'Agentes/Waves',
  chamadas: 'Chamadas',
};

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  duplicate: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-800',
};

export default function UploadHistory() {
  const [data, setData] = useState<UH[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(({ data: d }) => { setData(d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!data.length) {
    return <p className="text-sm text-gray-400 py-4 text-center">Sem uploads anteriores.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 text-left border-b">
            <th className="pb-2 pr-3 font-medium">Data</th>
            <th className="pb-2 pr-3 font-medium">Ficheiro</th>
            <th className="pb-2 pr-3 font-medium">Tipo</th>
            <th className="pb-2 pr-3 font-medium text-right">Recebidas</th>
            <th className="pb-2 pr-3 font-medium text-right">Inseridas</th>
            <th className="pb-2 pr-3 font-medium text-right">Rejeitadas</th>
            <th className="pb-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map(row => (
            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
              <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                {new Date(row.upload_timestamp).toLocaleString('pt-PT')}
              </td>
              <td className="py-2 pr-3 text-gray-700 max-w-[200px] truncate" title={row.filename}>
                {row.filename}
              </td>
              <td className="py-2 pr-3 text-gray-500">{TYPE_LABELS[row.file_type] ?? row.file_type}</td>
              <td className="py-2 pr-3 text-right">{row.rows_received?.toLocaleString('pt-PT')}</td>
              <td className="py-2 pr-3 text-right text-green-700 font-medium">
                {row.rows_inserted?.toLocaleString('pt-PT')}
              </td>
              <td className="py-2 pr-3 text-right">
                <span className={row.rows_rejected > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
                  {row.rows_rejected?.toLocaleString('pt-PT')}
                </span>
              </td>
              <td className="py-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
