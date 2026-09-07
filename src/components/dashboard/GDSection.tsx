'use client';
import { useEffect, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Tooltip, Legend } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import type { GDWeekly } from '@/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Tooltip, Legend);

interface Props { gdRateNovo?: number; gdRateAntigo?: number; }

export default function GDSection({ gdRateNovo, gdRateAntigo }: Props) {
  const [data, setData] = useState<GDWeekly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics/gd')
      .then(r => r.json())
      .then(({ data: d }) => { setData(d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!data.length) return <EmptyState title="Sem dados GD" />;

  const weeks = Array.from(new Set(data.map(d => d.week_label)));
  const novo = weeks.map(w => data.find(d => d.week_label === w && d.channel === 'Formulário Novo'));
  const antigo = weeks.map(w => data.find(d => d.week_label === w && d.channel === 'Formulário Antigo'));

  const multiplier = gdRateNovo && gdRateAntigo && gdRateAntigo > 0
    ? (gdRateNovo / gdRateAntigo).toFixed(1)
    : null;

  const chartData = {
    labels: weeks,
    datasets: [
      {
        type: 'bar' as const,
        label: 'GD Novo',
        data: novo.map(d => d?.gd_count ?? 0),
        backgroundColor: '#00B4A0',
        order: 2,
      },
      {
        type: 'bar' as const,
        label: 'GD Antigo',
        data: antigo.map(d => d?.gd_count ?? 0),
        backgroundColor: '#F4C0D1',
        order: 2,
      },
      {
        type: 'line' as const,
        label: '% GD Novo',
        data: novo.map(d => d?.gd_rate ?? null),
        borderColor: '#00B4A0',
        borderWidth: 2,
        pointRadius: 3,
        yAxisID: 'y2',
        order: 1,
        tension: 0.3,
      },
      {
        type: 'line' as const,
        label: '% GD Antigo',
        data: antigo.map(d => d?.gd_rate ?? null),
        borderColor: '#E8007D',
        borderWidth: 2,
        borderDash: [4, 4],
        pointRadius: 3,
        yAxisID: 'y2',
        order: 1,
        tension: 0.3,
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: { legend: { position: 'top' as const, labels: { font: { size: 11 }, boxWidth: 12 } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, title: { display: true, text: 'Nº GD', font: { size: 10 } } },
      y2: {
        type: 'linear' as const,
        position: 'right' as const,
        beginAtZero: true,
        max: 100,
        grid: { drawOnChartArea: false },
        title: { display: true, text: '% GD', font: { size: 10 } },
        ticks: { callback: (v: number | string) => `${v}%` },
      },
    },
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '% GD Novo', val: gdRateNovo, color: 'text-[#00B4A0]', bg: 'bg-teal-50' },
          { label: '% GD Antigo', val: gdRateAntigo, color: 'text-[#E8007D]', bg: 'bg-pink-50' },
          { label: 'Multiplicador', val: multiplier ? `${multiplier}x` : '—', color: 'text-[#00305E]', bg: 'bg-blue-50', noSuffix: true },
        ].map(({ label, val, color, bg, noSuffix }) => (
          <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{val !== undefined && val !== null && !noSuffix ? `${val}%` : val ?? '—'}</p>
          </div>
        ))}
      </div>
      <Chart type="bar" data={chartData} options={options} height={80} />
    </div>
  );
}
