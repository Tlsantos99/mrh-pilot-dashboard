'use client';
import { useEffect, useState } from 'react';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';

interface CallTotals {
  total: number; answered: number; answerRate: number;
  withinHoursTotal: number; answeredWithin: number; answerRateWithin: number;
  outsideHours: number; avgDurationMinutes: number;
}

export default function CallCenterSection() {
  const [totals, setTotals] = useState<CallTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics/calls')
      .then(r => r.json())
      .then(({ totals: t }) => { setTotals(t); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!totals || totals.total === 0) return <EmptyState title="Sem dados de chamadas" />;

  const items = [
    { label: 'Total chamadas', value: totals.total, color: 'text-[#00305E]' },
    { label: '% Atendidas', value: `${totals.answerRate}%`, color: 'text-[#00B4A0]' },
    { label: '% Atendidas (horário)', value: `${totals.answerRateWithin}%`, color: 'text-[#00B4A0]' },
    { label: 'Fora de horário', value: totals.outsideHours, color: 'text-[#EF9F27]' },
    { label: 'Duração média', value: `${totals.avgDurationMinutes} min`, color: 'text-gray-700' },
  ];

  return (
    <div className="space-y-3">
      {items.map(({ label, value, color }) => (
        <div key={label} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
          <span className="text-xs text-gray-500">{label}</span>
          <span className={`text-sm font-semibold ${color}`}>{value}</span>
        </div>
      ))}
      {totals.outsideHours > 0 && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-700">
            ⚠ {totals.outsideHours} chamadas fora do horário 08:45–16:45
          </p>
        </div>
      )}
    </div>
  );
}
