'use client';
import { useEffect, useState } from 'react';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import { buildQS } from '@/lib/utils/filters';
import type { AgentPerformance, DashboardFilters } from '@/types';

interface Props { filters?: DashboardFilters }

export default function AgentTable({ filters = {} }: Props) {
  const [data, setData] = useState<AgentPerformance[]>([]);
  const [lastWeekLabel, setLastWeekLabel] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/agents${buildQS(filters)}`)
      .then(r => r.json())
      .then(({ data: d, last_week_label }) => {
        setData(d ?? []);
        setLastWeekLabel(last_week_label ?? '');
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
          novo_lw: agents.reduce((s, a) => s + (a.novo_last_week ?? 0), 0),
          antigo_lw: agents.reduce((s, a) => s + (a.antigo_last_week ?? 0), 0),
        };
        const totalAdoption = (totals.novo + totals.antigo) > 0
          ? Math.round(totals.novo / (totals.novo + totals.antigo) * 1000) / 10
          : null;
        const totalAdoption4w = (() => {
          const n4 = agents.reduce((s, a) => s + (a.novo_last_week ?? 0), 0); // placeholder — using last_week as proxy
          const a4 = agents.reduce((s, a) => s + (a.antigo_last_week ?? 0), 0);
          return (n4 + a4) > 0 ? Math.round(n4 / (n4 + a4) * 1000) / 10 : null;
        })();
        const waveName = agents[0]?.wave_name ?? `Wave ${wave}`;

        return (
          <div key={wave}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-sm font-semibold text-[#00305E]">{waveName}</span>
              <span className="text-xs text-gray-400">({agents.length} AGEs)</span>
              {lastWeekLabel && (
                <span className="text-xs text-gray-400">· Última semana: <span className="font-medium text-gray-600">{lastWeekLabel}</span></span>
              )}
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
                  <th className="px-3 py-2 font-medium text-right" title="Novo e Antigo na última semana">Ult. Semana</th>
                  <th className="px-3 py-2 font-medium text-right rounded-r" title="Taxa de adoção nas últimas 4 semanas">% 4 Sem.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agents.map(a => {
                  const adopt4w = a.adoption_4weeks;
                  // Icon based on 4-week adoption (more representative of recent trend)
                  const hasRecent = adopt4w !== null && adopt4w !== undefined;
                  const good4w = hasRecent && (adopt4w as number) >= 50;
                  const warn4w = hasRecent && (adopt4w as number) < 50;
                  const lwNovo = a.novo_last_week ?? 0;
                  const lwAntigo = a.antigo_last_week ?? 0;
                  const lwHasData = lwNovo > 0 || lwAntigo > 0;

                  return (
                    <tr key={a.agent_code} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 font-medium text-gray-700">
                        <div className="flex items-center gap-1">
                          {good4w && <span className="text-teal-600 text-xs" title="Adoção ≥ 50% nas últimas 4 semanas">✓</span>}
                          {warn4w && <span className="text-amber-500 text-xs" title="Adoção < 50% nas últimas 4 semanas">⚠</span>}
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
                        {lwHasData ? (
                          <span className="inline-flex gap-1 items-center justify-end">
                            <span className="text-[#00B4A0] font-medium">{lwNovo}</span>
                            <span className="text-gray-300">/</span>
                            <span className="text-[#E8007D]">{lwAntigo}</span>
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {adopt4w !== null && adopt4w !== undefined ? (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${good4w ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'}`}>
                            {adopt4w}%
                          </span>
                        ) : <span className="text-gray-300">—</span>}
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
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex gap-1">
                      <span className="text-[#00B4A0]">{totals.novo_lw}</span>
                      <span className="text-gray-300">/</span>
                      <span className="text-[#E8007D]">{totals.antigo_lw}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(totalAdoption4w, '%')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="text-[10px] text-gray-400 mt-1">✓ = adoção ≥ 50% nas últimas 4 semanas · ⚠ = adoção &lt; 50% nas últimas 4 semanas · Ult. Semana = Novo / Antigo em {lastWeekLabel || '—'}</p>
    </div>
  );
}
