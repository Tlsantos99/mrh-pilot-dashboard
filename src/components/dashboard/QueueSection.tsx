'use client';
import { useEffect, useState } from 'react';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import { buildQS } from '@/lib/utils/filters';
import type { PendingOccurrence, DashboardFilters } from '@/types';

interface Props { filters?: DashboardFilters }

export default function QueueSection({ filters = {} }: Props) {
  const [data, setData] = useState<PendingOccurrence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/queue${buildQS(filters)}`)
      .then(r => r.json())
      .then(({ data: d }) => { setData(d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters.wave, filters.channel, filters.expertise]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState />;
  if (!data.length) return <EmptyState title="Sem ocorrências pendentes" message="Todas as ocorrências elegíveis têm data de aceitação." />;

  const alerts = data.filter(d => (d.days_waiting ?? 0) > 2);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Pendentes</p>
          <p className="text-2xl font-bold text-[#00305E]">{data.length}</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${alerts.length > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <p className="text-xs text-gray-500">&gt;2 dias úteis</p>
          <p className={`text-2xl font-bold ${alerts.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {alerts.length}
          </p>
        </div>
      </div>
      <div className="overflow-y-auto max-h-56">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="text-gray-400 text-left border-b">
              <th className="py-1 pr-2">Ocorrência</th>
              <th className="py-1 pr-2">Canal</th>
              <th className="py-1 pr-2">Abertura</th>
              <th className="py-1 text-right">Dias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.slice(0, 30).map(d => (
              <tr key={d.occurrence_id} className={`${(d.days_waiting ?? 0) > 2 ? 'bg-red-50/50' : ''}`}>
                <td className="py-1.5 pr-2 font-mono text-gray-700">{d.occurrence_id}</td>
                <td className="py-1.5 pr-2">
                  {d.channel === 'Formulário Novo' ? (
                    <span className="badge-novo">Novo</span>
                  ) : d.channel === 'Formulário Antigo' ? (
                    <span className="badge-antigo">Antigo</span>
                  ) : (
                    <span className="badge-email">Email</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-gray-500">
                  {d.opening_date ? new Date(d.opening_date).toLocaleDateString('pt-PT') : '—'}
                </td>
                <td className="py-1.5 text-right font-medium">
                  <span className={`px-1.5 py-0.5 rounded ${(d.days_waiting ?? 0) > 2 ? 'bg-red-100 text-red-700' : 'text-gray-600'}`}>
                    {d.days_waiting ?? '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
