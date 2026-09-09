'use client';
import { useEffect, useState } from 'react';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import { buildQS } from '@/lib/utils/filters';
import type { AgentPerformance, DashboardFilters } from '@/types';

interface Props { filters?: DashboardFilters }

export default function AgentTable({ filters = {} }: Props) {
  const [data, setData] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/agents${buildQS(filters)}`)
      .then(r => r.json())
      .then(({ data: d }) => {
        setData(d ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filters.wave, filters.channel, filters.expertise, filters.max_date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState />;
  if (!data.length) return <EmptyState title="Sem dados de AGEs" />;

  const waves = Array.from(new Set(data.map(d => d.wave_number).filter(Boolean))).sort() as number[];
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
        const waveName = agents[0]?.wave_name ?? `Wave ${wave}`;

        return (
          <div key={wave}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-sm font-semibold text-[#00305E]">{waveName}</span>
              <span className="text-xs text-gray-400">({agents.length} AGEs)</span>
                {totalAdoption !== null && (
                <span className="ml-auto text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                  Adoção global: {totalAdoption}%
                </span>
              )}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-3 py-2 font-medium rounded-l">AGE</th>
                  <th className="px-3 py-2 font-medium text-right">Novo</th>
                  <th className="px-3 py-2 font-medium text-right">Antigo</th>
                  <th className="px-3 py-2 font-medium text-right">Email</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">% Adoção</th>
                  <th className="px-3 py-2 font-medium text-right rounded-r" title="Taxa de adoção nos últimos 7 dias (face à data limite)">% Ult. 7 dias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agents.map(a => {
                  const adopt7d = a.adoption_last7d;
                  const hasRecent = adopt7d !== null && adopt7d !== undefined;
                  const good7d = hasRecent && (adopt7d as number) >= 50;
                  const warn7d = hasRecent && (adopt7d as number) < 50;

                  return (
                    <tr key={a.agent_code} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 font-medium text-gray-700">
                        <div className="flex items-center gap-1">
                          {good7d && <span className="text-teal-600 text-xs" title="Adoção ≥ 50% nos últimos 7 dias">✓</span>}
                          {warn7d && <span className="text-amber-500 text-xs" title="Adoção < 50% nos últimos 7 dias">⚠</span>}
                          {!hasRecent && <span className="text-gray-300 text-xs">—</span>}
                          <span>{a.agent_name ?? a.agent_code}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-[#00B4A0] font-medium">{a.novo}</td>
                      <td className="px-3 py-2 text-right text-[#E8007D]">{a.antigo}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{a.email_outro}</td>
                      <td className="px-3 py-2 text-right font-medium">{a.total}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${a.adoption_rate !== null && a.adoption_rate !== undefined && a.adoption_rate >= 50 ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
                          {fmt(a.adoption_rate, '%')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {a.adoption_last7d !== null && a.adoption_last7d !== undefined ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium cursor-default ${(a.adoption_last7d as number) >= 50 ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'}`}
                            title={`${a.novo_7d ?? 0} Novo · ${a.antigo_7d ?? 0} Antigo (últimos 7 dias)`}
                          >
                            {a.adoption_last7d}%
                          </span>
                        ) : (
                          <span
                            className="text-gray-300 cursor-default"
                            title={`${a.novo_7d ?? 0} Novo · ${a.antigo_7d ?? 0} Antigo (últimos 7 dias)`}
                          >—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-blue-50 font-semibold text-[#00305E] text-xs">
                  <td className="px-3 py-2">Total {waveName}</td>
                  <td className="px-3 py-2 text-right">{totals.novo}</td>
                  <td className="px-3 py-2 text-right">{totals.antigo}</td>
                  <td className="px-3 py-2 text-right">{totals.email}</td>
                  <td className="px-3 py-2 text-right">{totals.total}</td>
                  <td className="px-3 py-2 text-right">{fmt(totalAdoption, '%')}</td>
                  <td className="px-3 py-2 text-right">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="text-[10px] text-gray-400 mt-1">✓ = adoção ≥ 50% nos últimos 7 dias · ⚠ = adoção &lt; 50% nos últimos 7 dias</p>
    </div>
  );
}
