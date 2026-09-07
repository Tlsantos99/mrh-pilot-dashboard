'use client';
import { useEffect, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, LineController, PointElement, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import type { LeadTimeWeekly } from '@/types';

ChartJS.register(CategoryScale, LinearScale, LineElement, LineController, PointElement, Tooltip, Legend);

export default function LeadTimeSection() {
  const [data, setData] = useState<LeadTimeWeekly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics/lead-times')
      .then(r => r.json())
      .then(({ data: d }) => { setData(d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!data.length) return <EmptyState title="Sem dados de lead time" message="Disponível após o encerramento das ocorrências." />;

  const weeks = Array.from(new Set(data.map(d => d.week_label)));
  const gdNovo = weeks.map(w => data.find(d => d.week_label === w && d.expertise_type === 'Gestão Direta' && d.channel === 'Formulário Novo')?.avg_lt_total ?? null);
  const gdAntigo = weeks.map(w => data.find(d => d.week_label === w && d.expertise_type === 'Gestão Direta' && d.channel === 'Formulário Antigo')?.avg_lt_total ?? null);
  const peritagemNovo = weeks.map(w => data.find(d => d.week_label === w && d.expertise_type === 'Peritagem' && d.channel === 'Formulário Novo')?.avg_lt_total ?? null);

  const chartData = {
    labels: weeks,
    datasets: [
      { label: 'GD — Novo', data: gdNovo, borderColor: '#00B4A0', borderWidth: 2, pointRadius: 3, tension: 0.3 },
      { label: 'GD — Antigo', data: gdAntigo, borderColor: '#E8007D', borderDash: [4, 4], borderWidth: 2, pointRadius: 3, tension: 0.3 },
      { label: 'Peritagem — Novo', data: peritagemNovo, borderColor: '#EF9F27', borderWidth: 2, pointRadius: 3, tension: 0.3 },
    ],
  };

  const options = {
    responsive: true,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: { legend: { position: 'top' as const, labels: { font: { size: 11 }, boxWidth: 12 } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, title: { display: true, text: 'Dias úteis', font: { size: 10 } } },
    },
  };

  return <Line data={chartData} options={options} height={80} />;
}
