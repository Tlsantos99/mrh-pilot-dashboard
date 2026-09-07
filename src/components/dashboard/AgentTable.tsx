'use client';
import { useEffect, useState } from 'react';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import type { AgentPerformance } from '@/types';

export default function AgentTable() {
  const [data, setData] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics/agents')
      .then(r => r.json())
      .then(({ data: d }) => { setData(d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!data.length) return <EmptyState title="Sem dados de agentes" />;

  const waves = [...new Set(data.map(d => d.wave_number).filter(Boolean))].sort() as number[];
  const fmt = (n: number | null | undefined, suffix = '') => n !== null && n !== undefined ? `${n}${suffix}` : '—';

  return (
    <div className="space-y-6 overflow-x-auto">
      {waves.map(wave => {
        const agents = data.filter(d => d.wave_number === wave);
        const totals = {
          total: agents.reduce((s, a) => s + a.total, 0),
          novo: agents.reduce((s, a) => s + a.novo, 0),
          antigo: agents.reduce((s, a) => s + a.antigo, 0),
          email: agents.reduce((s, a) => s + a.email_outro, 0),
        };
        const totalAdoption = (totals.novo + totals.antigo) > 0
          ? Math.round(totals.novo / (totals.novo + totals.antigo) * 1000) / 10
          : null;

        return (
          <div key={wave}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-[#00305E]">Wave {wave}</span>
              <span className="text-xs text-gray-400">({agents.length} agentes)</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-3 py-2 font-medium rounded-l">Agente</th>
                  <th className="px-3 py-2 font-medium text-right">Novo</th>
                  <th className="px-3 py-2 font-medium text-right">Antigo</th>
                  <th className="px-3 py-2 font-medium text-right">Email</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">% Adoção</th>
                  <th className="px-3 py-2 font-medium text-right">% GD</th>
                  <th className="px-3 py-2 font-medium text-right rounded-r">LT Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agents.map(a => {
                  const good = a.adoption_rate !== null && a.adoption_rate !== undefined && a.adoption_rate >= 50;
                  const warn = a.novo < a.antigo;
                  return (
                    <tr key={a.agent_code} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 font-medium text-gray-700 flex items-center gap-1">
                        {good && <span title="Adoção ≥ 50%">✓</span>}
                        {warn && !good && <span title="Novo < Antigo" className="text-amber-500">⚠</span>}
                        <span>{a.agent_name ?? a.agent_code}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-[#00B4A0] font-medium">{a.novo}</td>
                      <td className="px-3 py-2 text-right text-[#E8007D]">{a.antigo}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{a.email_outro}</td>
                      <td className="px-3 py-2 text-right font-medium">{a.total}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${good ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
                          {fmt(a.adoption_rate, '%')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{fmt(a.gd_rate, '%')}</td>
                      <td className="px-3 py-2 text-right">{fmt(a.avg_lt_total, ' d')}</td>
                    </tr>
                  );
                })}
                <tr className="bg-blue-50 font-semibold text-[#00305E] text-xs">
                  <td className="px-3 py-2">Total Wave {wave}</td>
                  <td className="px-3 py-2 text-right">{totals.novo}</td>
                  <td className="px-3 py-2 text-right">{totals.antigo}</td>
                  <td className="px-3 py-2 text-right">{totals.email}</td>
                  <td className="px-3 py-2 text-right">{totals.total}</td>
                  <td className="px-3 py-2 text-right">{fmt(totalAdoption, '%')}</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
