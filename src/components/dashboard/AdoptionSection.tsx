'use client';
import { useEffect, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import { buildQS } from '@/lib/utils/filters';
import type { AdoptionWeekly, DashboardFilters } from '@/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Title, Tooltip, Legend);

interface Props { filters?: DashboardFilters }

export default function AdoptionSection({ filters = {} }: Props) {
  const [data, setData] = useState<AdoptionWeekly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/adoption${buildQS(filters)}`)
      .then(r => r.json())
      .then(({ data: d }) => { setData(d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters.wave, filters.channel, filters.expertise, filters.max_date]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return <Chart type="bar" data={chartData} options={options} height={80} />;
}
