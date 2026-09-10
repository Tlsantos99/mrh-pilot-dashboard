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

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Tooltip, Legend);

interface WeeklyRow {
  year: number; week: number; week_label: string;
  total_calls: number; within_hours: number; outside_hours: number;
  answered: number; abandoned: number;
  answer_rate_within_hours: number; avg_duration_minutes: number;
}

interface CallTotals {
  total: number; answered: number; answerRate: number;
  withinHoursTotal: number; answeredWithin: number; answerRateWithin: number;
  outsideHours: number; avgDurationMinutes: number;
}

export default function CallCenterSection({ maxDate }: { maxDate?: string }) {
  const [weekly, setWeekly] = useState<WeeklyRow[]>([]);
  const [totals, setTotals] = useState<CallTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = maxDate ? `?calls_max_date=${encodeURIComponent(maxDate)}` : '';
    fetch(`/api/metrics/calls${qs}`)
      .then(r => r.json())
      .then(({ totals: t, weekly: w }) => {
        setTotals(t ?? null);
        setWeekly(w ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [maxDate]);

  if (loading) return <LoadingState />;
  if (!totals || totals.total === 0) return <EmptyState title="Sem dados de chamadas" />;

  const fmt1 = (n: number | null | undefined, suffix = '') =>
    n !== null && n !== undefined ? `${n}${suffix}` : '—';

  const labels = weekly.map(w => w.week_label);
  const barData = weekly.map(w => w.within_hours);
  const answerRateData = weekly.map(w => Math.round(w.answer_rate_within_hours * 10) / 10);
  const abandonedData = weekly.map(w =>
    w.within_hours > 0 ? Math.round((w.abandoned / w.within_hours) * 1000) / 10 : 0
  );

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Chamadas',
        data: barData,
        backgroundColor: '#00B4A0cc',
        borderRadius: 4,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line' as const,
        label: '% Atendidas',
        data: answerRateData,
        borderColor: '#00305E',
        backgroundColor: '#00305E22',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#00305E',
        tension: 0.3,
        yAxisID: 'y1',
        order: 1,
        datalabels: { display: false },
      },
      {
        type: 'line' as const,
        label: '% Abandonadas',
        data: abandonedData,
        borderColor: '#E8007D',
        borderWidth: 2,
        borderDash: [4, 4],
        pointRadius: 3,
        pointBackgroundColor: '#E8007D',
        tension: 0.3,
        yAxisID: 'y1',
        order: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const, labels: { font: { size: 11 }, boxWidth: 12 } },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => {
            const suffix = ctx.datasetIndex > 0 ? '%' : '';
            return ` ${ctx.dataset.label}: ${ctx.parsed.y}${suffix}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: {
        position: 'left' as const,
        beginAtZero: true,
        title: { display: true, text: 'Chamadas', font: { size: 10 } },
        ticks: { font: { size: 10 }, stepSize: 10 },
      },
      y1: {
        position: 'right' as const,
        beginAtZero: true,
        max: 100,
        grid: { drawOnChartArea: false },
        title: { display: true, text: '%', font: { size: 10 } },
        ticks: { font: { size: 10 }, callback: (v: number | string) => `${v}%` },
      },
    },
  };

  return (
    <div className="space-y-4">
      {/* 3 KPI boxes */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-[#00B4A0]">{totals.withinHoursTotal}</p>
          <p className="text-xs font-medium text-gray-600 mt-1">chamadas no horário</p>
          <p className="text-[10px] text-gray-400 mt-0.5">08h45 – 16h45</p>
        </div>
        <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-[#00305E]">{fmt1(totals.answerRateWithin, '%')}</p>
          <p className="text-xs font-medium text-gray-600 mt-1">chamadas atendidas no horário</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {100 - totals.answerRateWithin > 0 ? `${(100 - totals.answerRateWithin).toFixed(1)}% não atendidas` : 'todas atendidas'}
          </p>
        </div>
        <div className="bg-pink-50 border border-pink-100 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-[#E8007D]">{fmt1(totals.avgDurationMinutes, ' min')}</p>
          <p className="text-xs font-medium text-gray-600 mt-1">duração média / chamada</p>
          <p className="text-[10px] text-gray-400 mt-0.5">&nbsp;</p>
        </div>
      </div>

      {/* Chart */}
      {weekly.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            Atendimento Semanal — Dentro do Horário de Funcionamento (08h45 – 16h45)
          </p>
          <Chart type="bar" data={chartData} options={options} height={90} />
        </div>
      )}

      {/* Footer alert */}
      {totals.outsideHours > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-2xl font-bold text-amber-600">{totals.outsideHours}</span>
          <p className="text-sm font-medium text-amber-800">
            Chamadas Fora do Horário de Atendimento
          </p>
        </div>
      )}
    </div>
  );
}
