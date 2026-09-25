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

function ExportButton({ filters }: { filters: DashboardFilters }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const qs = buildQS({ ...filters, status: undefined });
      const res = await fetch(`/api/export/lead-times${qs}`);
      if (!res.ok) throw new Error('Erro na exportação');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      link.download = match?.[1] ?? 'abertura_aceitacao.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      alert('Erro na exportação: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#00305E] border border-[#00305E]/30 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors shrink-0"
      title="Exportar ocorrências encerradas com datas e lead times (CSV)"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {loading ? 'A exportar...' : 'Exportar CSV'}
    </button>
  );
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
  function aggField(field: 'avg_lt_participation_opening' | 'avg_lt_opening_acceptance' | 'avg_lt_acceptance_closing' | 'avg_lt_total') {
    return allWeekLabels.map(wl => {
      const rows = ltData.filter(d => d.week_label === wl && d[field] != null);
      if (!rows.length) return null;
      const sumW = rows.reduce((s, r) => s + (r[field] as number) * (r.total ?? 1), 0);
      const tot = rows.reduce((s, r) => s + (r.total ?? 1), 0);
      return tot > 0 ? Math.round(sumW / tot * 10) / 10 : null;
    });
  }

  const poData = aggField('avg_lt_participation_opening');
  const oaData = aggField('avg_lt_opening_acceptance');

  const chartData = {
    labels: allWeekLabels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'LT Abertura (Participação→Abertura)',
        data: poData,
        backgroundColor: '#00305E',
        borderRadius: 3,
        stack: 'lt',
      },
      {
        type: 'bar' as const,
        label: 'LT Aceitação (Abertura→Aceitação)',
        data: oaData,
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

  const avgPO = globalAvg(poData);
  const avgOA = globalAvg(oaData);
  const avgTotal = (avgPO != null && avgOA != null) ? Math.round((avgPO + avgOA) * 10) / 10 : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportButton filters={filters} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">LT Abertura</p>
          <p className="text-2xl font-bold text-[#00305E]">{fmt1(avgPO)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Data Participação → Abertura Ocorrência</p>
        </div>
        <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">LT Aceitação</p>
          <p className="text-2xl font-bold text-[#00B4A0]">{fmt1(avgOA)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Abertura Ocorrência → Aceitação Sinistro</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">LT Total (soma)</p>
          <p className="text-2xl font-bold text-gray-700">{fmt1(avgTotal)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Participação → Aceitação Sinistro</p>
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-2">
          Barras empilhadas por semana de fecho — navy = LT Abertura, teal = LT Aceitação
        </p>
        <Chart type="bar" data={chartData} options={options} height={90} />
      </div>
    </div>
  );
}
