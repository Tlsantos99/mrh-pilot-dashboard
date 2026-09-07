'use client';
import { useEffect, useState } from 'react';
import LoadingState from '@/components/ui/LoadingState';
import type { DataQualityIssue } from '@/types';

export default function DataQualitySection() {
  const [data, setData] = useState<DataQualityIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics/quality')
      .then(r => r.json())
      .then(({ data: d }) => { setData(d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  const issues = data.filter(d => d.issue !== 'Eventos excluídos' && d.count > 0);
  const events = data.find(d => d.issue === 'Eventos excluídos');

  return (
    <div className="space-y-3">
      {events && events.count > 0 && (
        <div className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded">
          {events.count} ocorrências com evento excluídas das análises (auditoria disponível na BD)
        </div>
      )}
      {issues.length === 0 ? (
        <div className="text-center py-6 text-sm text-green-600 font-medium">
          ✓ Sem problemas de qualidade de dados identificados
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {issues.map(issue => (
            <div key={issue.issue} className={`rounded-lg p-3 border ${issue.count > 10 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="text-xs text-gray-600">{issue.issue}</p>
              <p className={`text-xl font-bold mt-1 ${issue.count > 10 ? 'text-red-600' : 'text-amber-600'}`}>
                {issue.count}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
