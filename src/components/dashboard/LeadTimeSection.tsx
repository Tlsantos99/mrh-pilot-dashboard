'use client';
import { useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, BarController, LineElement, LineController,
  PointElement, Tooltip, Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import { buildQS } from '@/lib/utils/filters';
import type { LeadTimeWeekly, DashboardFilters } from '@/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Tooltip, Legend);

interface Props {
  filters?: DashboardFilters;
  // Base counts (wave/channel filtered, NOT expertise filtered) — always shows full distribution
  gdCountBase?: number;
  peritagemCountBase?: number;
  closedGdCountBase?: number;
  closedPeritagemCountBase?: number;
}

export default function LeadTimeSection({ filters = {}, gdCountBase, peritagemCountBase, closedGdCountBase, closedPeritagemCountBase }: Props) {
  const [ltData, setLtData] = useState<LeadTimeWeekly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // LT API must never receive status filter — it always shows closed cases only
    const ltQS = buildQS({ ...filters, status: undefined });
    fetch(`/api/metrics/lead-times${ltQS}`)
      .then(r => r.json())
      .then(lt => {
        setLtData(lt.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filters.wave, filters.channel, filters.expertise, filters.max_date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState />;
  if (!ltData.length) return <EmptyState title="Sem dados de lead time" message="Disponível após o encerramento das ocorrências." />;

  // All week labels come from ltData (closed cases grouped by closing week)
  const allWeekLabels = Array.from(new Set(ltData.map(d => d.week_label))).sort((a, b) => {
    const aRow = ltData.find(d => d.week_label === a);
    const bRow = ltData.find(d => d.week_label === b);
    if ((aRow?.year ?? 0) !== (bRow?.year ?? 0)) return (aRow?.year ?? 0) - (bRow?.year ?? 0);
    return (aRow?.week ?? 0) - (bRow?.week ?? 0);
  });

  const isGdFilter = filters.expertise === 'false';
  const isPeritagemFilter = filters.expertise === 'true';

  // Label prefix depends on active expertise filter
  const ltPrefix = isGdFilter ? 'LT GD' : isPeritagemFilter ? 'LT Per.' : 'LT';

  // Bar data: closed cases per week per channel (from ltData — grouped by closing week)
  const novoBar = allWeekLabels.map(w => {
    const rows = ltData.filter(d => d.week_label === w && d.channel === 'Formulário Novo');
    return rows.length ? rows.reduce((s, r) => s + (r.total ?? 0), 0) : null;
  });
  const antigoBar = allWeekLabels.map(w => {
    const rows = ltData.filter(d => d.week_label === w && d.channel === 'Formulário Antigo');
    return rows.length ? rows.reduce((s, r) => s + (r.total ?? 0), 0) : null;
  });

  // Line data — aggregate by channel (novo/antigo) across whatever expertise filter is active.
  // The API already filters by expertise, so ltData only contains the relevant rows.
  function aggByChannel(channel: string) {
    return allWeekLabels.map(w => {
      const rows = ltData.filter(d => d.week_label === w && d.channel === channel);
      const valid = rows.filter(r => r.avg_lt_total != null);
      if (!valid.length) return null;
      const sumLt = valid.reduce((s, r) => s + (r.avg_lt_total ?? 0) * (r.total ?? 1), 0);
      const tot = valid.reduce((s, r) => s + (r.total ?? 1), 0);
      return tot > 0 ? Math.round(sumLt / tot * 10) / 10 : null;
    });
  }

  const ltNovo = aggByChannel('Formulário Novo');
  const ltAntigo = aggByChannel('Formulário Antigo');

  const datasets = [];
  // Bars always visible
  datasets.push({
    type: 'bar' as const,
    label: 'Form. Novo',
    data: novoBar,
    backgroundColor: '#00B4A055',
    borderColor: '#00B4A0',
    borderWidth: 1,
    borderRadius: 3,
    yAxisID: 'y2',
    order: 3,
  });
  datasets.push({
    type: 'bar' as const,
    label: 'Form. Antigo',
    data: antigoBar,
    backgroundColor: '#E8007D44',
    borderColor: '#E8007D',
    borderWidth: 1,
    borderRadius: 3,
    yAxisID: 'y2',
    order: 3,
  });
  // Lines: LT Novo and LT Antigo (aggregated across active expertise filter)
  datasets.push({
    type: 'line' as const,
    label: `${ltPrefix} — Novo`,
    data: ltNovo,
    borderColor: '#00B4A0',
    backgroundColor: 'transparent',
    borderWidth: 2.5,
    pointRadius: 3,
    pointBackgroundColor: '#00B4A0',
    tension: 0.3,
    yAxisID: 'y',
    order: 1,
    spanGaps: true,
  });
  datasets.push({
    type: 'line' as const,
    label: `${ltPrefix} — Antigo`,
    data: ltAntigo,
    borderColor: '#E8007D',
    backgroundColor: 'transparent',
    borderWidth: 2.5,
    borderDash: [5, 4],
    pointRadius: 3,
    pointBackgroundColor: '#E8007D',
    tension: 0.3,
    yAxisID: 'y',
    order: 1,
    spanGaps: true,
  });

  const chartData = { labels: allWeekLabels, datasets };

  const options = {
    responsive: true,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const, labels: { font: { size: 10 }, boxWidth: 10 } },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => {
            const suffix = ctx.dataset.yAxisID === 'y' ? ' dias' : ' ocorr.';
            return ` ${ctx.dataset.label}: ${ctx.parsed.y ?? '—'}${suffix}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
      y: {
        position: 'left' as const,
        beginAtZero: true,
        title: { display: true, text: 'Dias úteis', font: { size: 10 } },
        ticks: { font: { size: 9 } },
      },
      y2: {
        position: 'right' as const,
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Enc. (ocorr.)', font: { size: 10 } },
        ticks: { font: { size: 9 }, stepSize: 5 },
      },
    },
  };

  const fmt = (n: number | null | undefined) => n !== null && n !== undefined ? String(n) : '—';

  return (
    <div className="space-y-4">
      {/* Occurrence count boxes — always shows full distribution (not affected by expertise filter) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Ocorrências em Gestão Direta</p>
          <p className="text-2xl font-bold text-[#00B4A0]">{fmt(gdCountBase)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{fmt(closedGdCountBase)} encerradas · LT calculado</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Ocorrências com Peritagem</p>
          <p className="text-2xl font-bold text-[#EF9F27]">{fmt(peritagemCountBase)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{fmt(closedPeritagemCountBase)} encerradas · LT calculado</p>
        </div>
      </div>

      {/* Chart */}
      <div>
        <p className="text-xs text-gray-400 mb-2">
          Linhas = LT médio (dias úteis, eixo esq.) · Barras = n.º ocorrências encerradas (eixo dir.)
        </p>
        <Chart type="bar" data={chartData} options={options} height={90} />
      </div>
    </div>
  );
}
