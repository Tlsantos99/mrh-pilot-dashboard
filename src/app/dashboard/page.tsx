'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
import type { SummaryKPIs, DashboardFilters } from '@/types';

interface LastUpdate { [key: string]: string }

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingState message="A carregar dashboard..." />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const sp = useSearchParams();
  const wave = sp.get('wave') ?? undefined;
  const channel = sp.get('channel') ?? undefined;
  const expertise = sp.get('expertise') ?? undefined;
  const status = sp.get('status') ?? undefined;
  const filters: DashboardFilters = { wave, channel, expertise, status };

  const [kpis, setKpis] = useState<SummaryKPIs | null>(null);
  const [lastUpdate, setLastUpdate] = useState<LastUpdate>({});
  const [loading, setLoading] = useState(true);
  const [noData, setNoData] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (wave) p.set('wave', wave);
      if (channel) p.set('channel', channel);
      if (expertise) p.set('expertise', expertise);
      if (status) p.set('status', status);
      const qs = p.toString();
      const res = await fetch(`/api/metrics/summary${qs ? `?${qs}` : ''}`);
      const { kpis: data, lastUpdate: lu } = await res.json() as { kpis: import('@/types').SummaryKPIs; lastUpdate: Record<string, string> };
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
  }, [wave, channel, expertise, status]);

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

  const gdMultiplier = kpis && kpis.gd_rate_antigo && kpis.gd_rate_novo && kpis.gd_rate_antigo > 0
    ? (kpis.gd_rate_novo / kpis.gd_rate_antigo).toFixed(1)
    : null;

  const lastUpdateStr = Object.values(lastUpdate)[0]
    ? new Date(Object.values(lastUpdate)[0]).toLocaleString('pt-PT')
    : '—';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div id="resumo" className="flex items-center justify-between scroll-mt-4">
        <div>
          <h1 className="text-2xl font-bold text-[#00305E]">Dashboard Piloto MRH</h1>
          <p className="text-sm text-gray-500 mt-0.5">Danos por Água e Riscos Elétricos — Ageas Portugal</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Última atualização</p>
          <p className="text-sm font-medium text-gray-600">{lastUpdateStr}</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPICard label="Total elegíveis" value={fmt(kpis?.total_eligible)} color="navy"
          tooltip="Ocorrências do ramo Riscos Múltiplos-Habitação abertas por AGEs do piloto, excluindo eventos. São elegíveis as participações que cumprem os critérios de inclusão no piloto do Formulário Novo." />
        <KPICard label="Formulário Novo" value={fmt(kpis?.total_novo)} color="teal" />
        <KPICard label="Formulário Antigo" value={fmt(kpis?.total_antigo)} color="pink" />
        <KPICard label="Taxa de Adoção" value={fmt(kpis?.adoption_rate, '%')} color="teal" />
        <KPICard label="% GD Global" value={fmt(kpis?.gd_rate_global, '%')} color="navy" />
        <KPICard label="% GD Novo" value={fmt(kpis?.gd_rate_novo, '%')} color="teal"
          sub={gdMultiplier ? `${gdMultiplier}x vs Antigo` : undefined} />
        <KPICard label="LT médio GD" value={fmt(kpis?.avg_lt_gd, ' dias')} color="orange" />
      </div>

      {/* Section 1 — Adoção */}
      <div id="adocao" className="card p-6 scroll-mt-4">
        <SectionHeader title="1. Taxa de Adoção" subtitle="Formulário Novo vs Antigo por semana" />
        {/* Adoption rate highlight */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="bg-teal-50 rounded-xl px-6 py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Taxa de Adoção</p>
            <p className="text-5xl font-bold text-[#00B4A0]">{fmt(kpis?.adoption_rate, '%')}</p>
            <p className="text-xs text-gray-400 mt-1">Form. Novo / (Novo + Antigo)</p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-gray-500">Formulário Novo</p>
              <p className="text-3xl font-bold text-[#00305E]">{fmt(kpis?.total_novo)}</p>
              <p className="text-xs text-gray-400">{fmt(kpis?.gd_rate_novo, '% GD')}</p>
            </div>
            <div className="bg-pink-50 rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-gray-500">Formulário Antigo</p>
              <p className="text-3xl font-bold text-[#E8007D]">{fmt(kpis?.total_antigo)}</p>
              <p className="text-xs text-gray-400">{fmt(kpis?.gd_rate_antigo, '% GD')}</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-gray-500">Email/Outro</p>
              <p className="text-3xl font-bold text-gray-500">{fmt(kpis?.total_email)}</p>
              <p className="text-xs text-gray-400">—</p>
            </div>
          </div>
        </div>
        <AdoptionSection filters={filters} />
      </div>

      {/* Section 2 — Gestão Direta */}
      <div id="gd" className="card p-6 scroll-mt-4">
        <SectionHeader title="2. Gestão Direta (sem peritagem)" subtitle="Evolução semanal por canal" />
        <GDSection gdRateNovo={kpis?.gd_rate_novo} gdRateAntigo={kpis?.gd_rate_antigo} filters={filters} />
      </div>

      {/* Section 3 — Lead Times */}
      <div id="lead-times" className="card p-6 scroll-mt-4">
        <SectionHeader title="3. Lead Times" subtitle="Dias úteis — apenas ocorrências encerradas" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KPICard label="LT Global" value={fmt(kpis?.avg_lt_total, ' dias')} color="navy" size="sm" />
          <KPICard label="LT GD" value={fmt(kpis?.avg_lt_gd, ' dias')} color="teal" size="sm" />
          <KPICard label="LT Peritagem" value={fmt(kpis?.avg_lt_expertise, ' dias')} color="pink" size="sm" />
          <KPICard label="LT Abertura→Aceitação" value={fmt(kpis?.avg_lt_opening_acceptance, ' dias')} color="orange" size="sm" />
        </div>
        <LeadTimeSection
          filters={filters}
          gdCountBase={kpis?.total_gd_base}
          peritagemCountBase={kpis?.total_peritagem_base}
          closedGdCountBase={kpis?.closed_gd_count_base}
          closedPeritagemCountBase={kpis?.closed_peritagem_count_base}
        />
      </div>

      {/* Section 4 — Por Mediadora */}
      <div id="agentes" className="card p-6 scroll-mt-4">
        <SectionHeader title="4. Performance por Mediadora" subtitle="Agrupado por ASF Agregador e Wave" />
        <AgentTable filters={filters} />
      </div>

      {/* Sections 5 + 6 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div id="chamadas" className="card p-6 scroll-mt-4">
          <SectionHeader title="5. Linha de Apoio" subtitle="Chamadas recebidas" />
          <CallCenterSection />
        </div>
        <div id="fila" className="card p-6 scroll-mt-4">
          <SectionHeader title="6. Fila de Espera do Robot" subtitle="Ocorrências sem aceitação" />
          <QueueSection filters={filters} />
        </div>
      </div>

      {/* Data Quality */}
      <div id="qualidade" className="card p-6 scroll-mt-4">
        <SectionHeader title="Qualidade dos Dados" subtitle="Problemas identificados" />
        <DataQualitySection />
      </div>
    </div>
  );
}
