'use client';
import { useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, BarController, Tooltip, Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import { buildQS } from '@/lib/utils/filters';
import type { LeadTimeWeekly, DashboardFilters } from '@/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip, Legend);

interface Props { filters?: DashboardFilters }

function fmt1(v: number | null): string {
  return v != null ? `${v.toFixed(1)} dias` : '—';
}

export default function LeadTimeBreakdownSection({ filters = {} }: Props) {
  const [ltData, setLtData] = useState<LeadTimeWeekly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const ltQS = buildQS({ ...filters, status: undefined });
    fetch(`/api/metrics/lead-times${ltQS}`)
      .then(r => r.json())
      .then(lt => { setLtData(lt.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters.wave, filters.channel, filters.expertise, filters.max_date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState />;
  if (!ltData.length) return <EmptyState title="Sem dados de lead time" message="Disponível após o encerramento das ocorrências." />;

  const allWeekLabels = Array.from(new Set(ltData.map(d => d.week_label))).sort((a, b) => {
    const aRow = ltData.find(d => d.week_label === a);
    const bRow = ltData.find(d => d.week_label === b);
    if ((aRow?.year ?? 0) !== (bRow?.year ?? 0)) return (aRow?.year ?? 0) - (bRow?.year ?? 0);
    return (aRow?.week ?? 0) - (bRow?.week ?? 0);
  });

  // Weighted average per week across all channels/expertise
  function aggField(field: 'avg_lt_opening_acceptance' | 'avg_lt_acceptance_closing' | 'avg_lt_total') {
    return allWeekLabels.map(wl => {
      const rows = ltData.filter(d => d.week_label === wl && d[field] != null);
      if (!rows.length) return null;
      const sumW = rows.reduce((s, r) => s + (r[field] as number) * (r.total ?? 1), 0);
      const tot = rows.reduce((s, r) => s + (r.total ?? 1), 0);
      return tot > 0 ? Math.round(sumW / tot * 10) / 10 : null;
    });
  }

  const oaData = aggField('avg_lt_opening_acceptance');
  const acData = aggField('avg_lt_acceptance_closing');

  const chartData = {
    labels: allWeekLabels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Fase Abertura',
        data: oaData,
        backgroundColor: '#00305E',
        borderRadius: 3,
        stack: 'lt',
      },
      {
        type: 'bar' as const,
        label: 'Fase Aceitação',
        data: acData,
        backgroundColor: '#00B4A0',
        borderRadius: 3,
        stack: 'lt',
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const, labels: { font: { size: 10 }, boxWidth: 10 } },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) : '—'} dias úteis`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          footer: (items: any[]) => {
            const total = items.reduce((s, i) => s + (i.parsed.y ?? 0), 0);
            return `Total: ${total.toFixed(1)} dias úteis`;
          },
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
      y: {
        stacked: true,
        beginAtZero: true,
        title: { display: true, text: 'Dias úteis (médio)', font: { size: 10 } },
        ticks: { font: { size: 9 } },
      },
    },
  };

  // Summary KPIs — weighted avg across all weeks
  function globalAvg(data: (number | null)[]): number | null {
    const vals = data.filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;
  }

  const avgOA = globalAvg(oaData);
  const avgAC = globalAvg(acData);
  const avgTotal = (avgOA != null && avgAC != null) ? Math.round((avgOA + avgAC) * 10) / 10 : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">LT médio Fase Abertura</p>
          <p className="text-2xl font-bold text-[#00305E]">{fmt1(avgOA)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">abertura → aceitação pelo robot</p>
        </div>
        <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">LT médio Fase Aceitação</p>
          <p className="text-2xl font-bold text-[#00B4A0]">{fmt1(avgAC)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">aceitação → resolução</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">LT médio Total</p>
          <p className="text-2xl font-bold text-gray-700">{fmt1(avgTotal)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">abertura → resolução (soma)</p>
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-2">
          Barras empilhadas por semana — ocorrências encerradas, média ponderada por canal e tipo
        </p>
        <Chart type="bar" data={chartData} options={options} height={90} />
      </div>
    </div>
  );
}
