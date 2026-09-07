'use client';
import { useEffect, useState, useCallback } from 'react';
import KPICard from '@/components/ui/KPICard';
import SectionHeader from '@/components/ui/SectionHeader';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import AdoptionSection from '@/components/dashboard/AdoptionSection';
import GDSection from '@/components/dashboard/GDSection';
import LeadTimeSection from '@/components/dashboard/LeadTimeSection';
import AgentTable from '@/components/dashboard/AgentTable';
import CallCenterSection from '@/components/dashboard/CallCenterSection';
import QueueSection from '@/components/dashboard/QueueSection';
import DataQualitySection from '@/components/dashboard/DataQualitySection';
import type { SummaryKPIs } from '@/types';

interface LastUpdate { [key: string]: string }

export default function DashboardPage() {
  const [kpis, setKpis] = useState<SummaryKPIs | null>(null);
  const [lastUpdate, setLastUpdate] = useState<LastUpdate>({});
  const [loading, setLoading] = useState(true);
  const [noData, setNoData] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics/summary');
      const { kpis: data, lastUpdate: lu } = await res.json();
      if (!data || data.total_eligible === 0) {
        setNoData(true);
      } else {
        setKpis(data);
        setLastUpdate(lu ?? {});
        setNoData(false);
      }
    } catch {
      setNoData(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  if (loading) return <LoadingState message="A carregar dashboard..." />;

  if (noData) {
    return (
      <EmptyState
        title="Sem dados disponíveis"
        message="Importe os ficheiros na página Gestão de Dados para visualizar os indicadores do piloto."
        action={
          <a href="/data-management"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-[#00305E] rounded-lg hover:bg-[#004080] transition">
            Ir para Gestão de Dados
          </a>
        }
      />
    );
  }

  const fmt = (n: number | null | undefined, suffix = '') =>
    n !== null && n !== undefined ? `${n}${suffix}` : '—';

  const gdMultiplier = kpis && kpis.gd_rate_antigo && kpis.gd_rate_novo
    ? (kpis.gd_rate_novo / kpis.gd_rate_antigo).toFixed(1)
    : null;

  const lastUpdateStr = Object.values(lastUpdate)[0]
    ? new Date(Object.values(lastUpdate)[0]).toLocaleString('pt-PT')
    : '—';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#00305E]">Dashboard Piloto MRH</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Danos por Água e Riscos Elétricos — Ageas Portugal
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Última atualização</p>
          <p className="text-sm font-medium text-gray-600">{lastUpdateStr}</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <KPICard label="Total elegíveis" value={fmt(kpis?.total_eligible)} color="navy" />
        <KPICard label="Formulário Novo" value={fmt(kpis?.total_novo)} color="teal" />
        <KPICard label="Formulário Antigo" value={fmt(kpis?.total_antigo)} color="pink" />
        <KPICard label="Taxa de Adoção" value={fmt(kpis?.adoption_rate, '%')} color="teal" />
        <KPICard label="% GD Global" value={fmt(kpis?.gd_rate_global, '%')} color="navy" />
        <KPICard label="% GD Novo" value={fmt(kpis?.gd_rate_novo, '%')} color="teal"
          sub={gdMultiplier ? `${gdMultiplier}x vs Antigo` : undefined} />
        <KPICard label="LT médio GD" value={fmt(kpis?.avg_lt_gd, ' dias')} color="orange" />
      </div>

      {/* Section 1 — Adoção */}
      <div className="card p-6">
        <SectionHeader title="1. Taxa de Adoção" subtitle="Formulário Novo vs Antigo por semana" />
        <AdoptionSection />
      </div>

      {/* Section 2 — Gestão Direta */}
      <div className="card p-6">
        <SectionHeader title="2. Gestão Direta (sem peritagem)" subtitle="Evolução semanal por canal" />
        <GDSection gdRateNovo={kpis?.gd_rate_novo} gdRateAntigo={kpis?.gd_rate_antigo} />
      </div>

      {/* Section 3 — Lead Times */}
      <div className="card p-6">
        <SectionHeader title="3. Lead Times" subtitle="Dias úteis — apenas ocorrências encerradas" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KPICard label="LT Global" value={fmt(kpis?.avg_lt_total, ' dias')} color="navy" size="sm" />
          <KPICard label="LT GD" value={fmt(kpis?.avg_lt_gd, ' dias')} color="teal" size="sm" />
          <KPICard label="LT Peritagem" value={fmt(kpis?.avg_lt_expertise, ' dias')} color="pink" size="sm" />
          <KPICard label="LT Abertura→Aceitação" value={fmt(kpis?.avg_lt_opening_acceptance, ' dias')} color="orange" size="sm" />
        </div>
        <LeadTimeSection />
      </div>

      {/* Section 4 — Agentes */}
      <div className="card p-6">
        <SectionHeader title="4. Performance por Agente" subtitle="Agrupado por Wave" />
        <AgentTable />
      </div>

      {/* Section 5 + 6 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <SectionHeader title="5. Linha de Apoio" subtitle="Chamadas recebidas" />
          <CallCenterSection />
        </div>
        <div className="card p-6">
          <SectionHeader title="6. Fila de Espera do Robot" subtitle="Ocorrências sem aceitação" />
          <QueueSection />
        </div>
      </div>

      {/* Data Quality */}
      <div className="card p-6">
        <SectionHeader title="Qualidade dos Dados" subtitle="Problemas identificados" />
        <DataQualitySection />
      </div>
    </div>
  );
}
