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
import type { LeadTimeWeekly, AdoptionWeekly, DashboardFilters } from '@/types';

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
  const [adoptionData, setAdoptionData] = useState<AdoptionWeekly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = buildQS(filters);
    Promise.all([
      fetch(`/api/metrics/lead-times${qs}`).then(r => r.json()),
      fetch(`/api/metrics/adoption${qs}`).then(r => r.json()),
    ])
      .then(([lt, adop]) => {
        setLtData(lt.data ?? []);
        setAdoptionData(adop.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filters.wave, filters.channel, filters.expertise, filters.max_date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState />;
  if (!ltData.length) return <EmptyState title="Sem dados de lead time" message="Disponível após o encerramento das ocorrências." />;

  // Merge weeks from adoption (for bars) and lead-times (for lines)
  const allWeekLabels = Array.from(new Set([
    ...adoptionData.map(d => d.week_label),
    ...ltData.map(d => d.week_label),
  ])).sort((a, b) => {
    const aRow = adoptionData.find(d => d.week_label === a) ?? ltData.find(d => d.week_label === a);
    const bRow = adoptionData.find(d => d.week_label === b) ?? ltData.find(d => d.week_label === b);
    const aW = (aRow as { year?: number; week?: number })?.year ?? 0;
    const bW = (bRow as { year?: number; week?: number })?.year ?? 0;
    if (aW !== bW) return aW - bW;
    const aWk = (aRow as { week?: number })?.week ?? 0;
    const bWk = (bRow as { week?: number })?.week ?? 0;
    return aWk - bWk;
  });

  const isGdFilter = filters.expertise === 'false';
  const isPeritagemFilter = filters.expertise === 'true';

  // Bar data (weekly occurrence counts from adoption API)
  const novoBar = allWeekLabels.map(w => adoptionData.find(d => d.week_label === w)?.novo ?? null);
  const antigoBar = allWeekLabels.map(w => adoptionData.find(d => d.week_label === w)?.antigo ?? null);

  // Line data (LT averages from lead-times API)
  const ltGdNovo = allWeekLabels.map(w =>
    ltData.find(d => d.week_label === w && d.expertise_type === 'Gestão Direta' && d.channel === 'Formulário Novo')?.avg_lt_total ?? null
  );
  const ltGdAntigo = allWeekLabels.map(w =>
    ltData.find(d => d.week_label === w && d.expertise_type === 'Gestão Direta' && d.channel === 'Formulário Antigo')?.avg_lt_total ?? null
  );
  const ltPeritagem = allWeekLabels.map(w => {
    const rows = ltData.filter(d => d.week_label === w && d.expertise_type === 'Peritagem');
    if (!rows.length) return null;
    const valid = rows.filter(r => r.avg_lt_total != null);
    if (!valid.length) return null;
    const sumLt = valid.reduce((s, r) => s + (r.avg_lt_total ?? 0) * (r.total ?? 1), 0);
    const totalOcc = valid.reduce((s, r) => s + (r.total ?? 1), 0);
    return totalOcc > 0 ? Math.round(sumLt / totalOcc * 10) / 10 : null;
  });

  const datasets = [];
  // Bars always visible (show occurrence volume by channel regardless of expertise filter)
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
  // Lines
  if (!isPeritagemFilter) {
    datasets.push({
      type: 'line' as const,
      label: 'LT GD — Novo',
      data: ltGdNovo,
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
      label: 'LT GD — Antigo',
      data: ltGdAntigo,
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
  }
  if (!isGdFilter) {
    datasets.push({
      type: 'line' as const,
      label: 'LT Peritagem',
      data: ltPeritagem,
      borderColor: '#EF9F27',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [3, 3],
      pointRadius: 3,
      pointBackgroundColor: '#EF9F27',
      tension: 0.3,
      yAxisID: 'y',
      order: 1,
      spanGaps: true,
    });
  }

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
        title: { display: true, text: 'Ocorrências', font: { size: 10 } },
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
          Linhas = LT médio (dias úteis, eixo esq.) · Barras = n.º ocorrências abertas (eixo dir.)
        </p>
        <Chart type="bar" data={chartData} options={options} height={90} />
      </div>
    </div>
  );
}
