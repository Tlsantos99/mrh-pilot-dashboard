'use client';
import { useEffect, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import type { AdoptionWeekly } from '@/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

export default function AdoptionSection() {
  const [data, setData] = useState<AdoptionWeekly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics/adoption')
      .then(r => r.json())
      .then(({ data: d }) => { setData(d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!data.length) return <EmptyState title="Sem dados de adoção" />;

  const labels = data.map(d => d.week_label);

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Formulário Novo',
        data: data.map(d => d.novo),
        backgroundColor: '#00B4A0',
        stack: 'stack',
        order: 2,
      },
      {
        type: 'bar' as const,
        label: 'Formulário Antigo',
        data: data.map(d => d.antigo),
        backgroundColor: '#E8007D',
        stack: 'stack',
        order: 2,
      },
      {
        type: 'bar' as const,
        label: 'Email/Outro',
        data: data.map(d => d.email_outro),
        backgroundColor: '#D1D5DB',
        stack: 'stack',
        order: 2,
      },
      {
        type: 'line' as const,
        label: '% Adoção',
        data: data.map(d => d.adoption_rate),
        borderColor: '#00305E',
        backgroundColor: '#00305E',
        borderWidth: 2,
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
    plugins: {
      legend: { position: 'top' as const, labels: { font: { size: 11 }, boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const suffix = ctx.dataset.label === '% Adoção' ? '%' : '';
            return ` ${ctx.dataset.label}: ${ctx.parsed.y ?? ''}${suffix}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Nº Ocorrências', font: { size: 10 } } },
      y2: {
        type: 'linear' as const,
        position: 'right' as const,
        beginAtZero: true,
        max: 100,
        grid: { drawOnChartArea: false },
        title: { display: true, text: '% Adoção', font: { size: 10 } },
        ticks: { callback: (v: number | string) => `${v}%` },
      },
    },
  };

  // Volume cards
  const totalNovo = data.reduce((s, d) => s + d.novo, 0);
  const totalAntigo = data.reduce((s, d) => s + d.antigo, 0);
  const totalEmail = data.reduce((s, d) => s + d.email_outro, 0);
  const totalAll = totalNovo + totalAntigo + totalEmail;
  const pct = (n: number) => totalAll > 0 ? Math.round((n / totalAll) * 10) / 10 * 10 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Formulário Novo', val: totalNovo, color: 'text-[#00B4A0]', bg: 'bg-teal-50' },
          { label: 'Formulário Antigo', val: totalAntigo, color: 'text-[#E8007D]', bg: 'bg-pink-50' },
          { label: 'Email/Outro', val: totalEmail, color: 'text-gray-500', bg: 'bg-gray-50' },
        ].map(({ label, val, color, bg }) => (
          <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{val}</p>
            <p className="text-xs text-gray-400">{pct(val).toFixed(1)}% do total</p>
          </div>
        ))}
      </div>
      <Chart type="bar" data={chartData} options={options} height={80} />
    </div>
  );
}
