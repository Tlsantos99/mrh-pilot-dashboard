'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, BarController, LineElement, LineController,
  PointElement, Tooltip, Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Tooltip, Legend);

interface KPIs {
  total_eligible: number; total_novo: number; total_antigo: number; total_email: number;
  adoption_rate: number; gd_rate_global: number; gd_rate_novo: number; gd_rate_antigo: number;
  gd_rate_closed: number; gd_rate_novo_closed: number; gd_rate_antigo_closed: number;
  total_gd_base: number; total_peritagem_base: number;
  closed_gd_count_base: number; closed_peritagem_count_base: number;
  avg_lt_total: number | null; avg_lt_gd: number | null; avg_lt_expertise: number | null;
  avg_lt_opening_acceptance: number | null; avg_lt_opening_acceptance_novo: number | null;
}
interface AgentRow {
  agent_code: string; agent_name: string; wave_number: number; wave_name: string;
  total: number; novo: number; antigo: number; email_outro: number;
  adoption_rate: number | null; gd_rate: number | null; avg_lt_total: number | null;
  adoption_last7d?: number | null; novo_7d?: number; antigo_7d?: number;
}
interface CallTotals {
  total: number; answered: number; answerRate: number;
  withinHoursTotal: number; answeredWithin: number; answerRateWithin: number;
  outsideHours: number; avgDurationMinutes: number;
}
interface WeeklyCall {
  year: number; week: number; week_label: string;
  total_calls: number; within_hours: number; outside_hours: number;
  answered: number; abandoned: number;
  answer_rate_within_hours: number; avg_duration_minutes: number;
}
interface LtRow {
  year: number; week: number; week_label: string;
  channel: string; expertise_type: string;
  total: number; avg_lt_total: number | null; avg_lt_opening_acceptance: number | null;
}
interface ReportData {
  kpis: KPIs; agents: AgentRow[]; calls: CallTotals | null;
  weekly: WeeklyCall[]; ltData: LtRow[];
  maxDate: string; callsMaxDate: string; generatedAt: string;
  adoptionBefore: number | null; adoptionBeforeDate: string;
}

function fmt(n: number | null | undefined, suffix = '') {
  if (n === null || n === undefined) return '—';
  return `${n}${suffix}`;
}

// Shared week-label sort
function sortWeekLabels(labels: string[], source: LtRow[]) {
  return [...labels].sort((a, b) => {
    const ar = source.find(d => d.week_label === a);
    const br = source.find(d => d.week_label === b);
    if ((ar?.year ?? 0) !== (br?.year ?? 0)) return (ar?.year ?? 0) - (br?.year ?? 0);
    return (ar?.week ?? 0) - (br?.week ?? 0);
  });
}

export default function ReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [maxDate, setMaxDate] = useState(today);
  const [callsMaxDate, setCallsMaxDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartInstances = useRef<Record<string, ChartJS<any, any, any>>>({});

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const beforeDate = new Date(maxDate + 'T12:00:00');
      beforeDate.setDate(beforeDate.getDate() - 6);
      const beforeDateStr = beforeDate.toISOString().slice(0, 10);
      const qs = `?max_date=${maxDate}`;
      const callsQS = `?calls_max_date=${callsMaxDate}`;
      const [sumRes, agRes, callRes, ltRes, sumBeforeRes] = await Promise.all([
        fetch(`/api/metrics/summary${qs}`),
        fetch(`/api/metrics/agents${qs}`),
        fetch(`/api/metrics/calls${callsQS}`),
        fetch(`/api/metrics/lead-times${qs}`),
        fetch(`/api/metrics/summary?max_date=${beforeDateStr}`),
      ]);
      const { kpis } = await sumRes.json();
      const { data: agents } = await agRes.json();
      const { totals: calls, weekly } = await callRes.json();
      const { data: ltData } = await ltRes.json();
      const { kpis: kpisBefore } = await sumBeforeRes.json();
      if (!kpis) throw new Error('Sem dados — verifique os filtros.');
      setData({
        kpis, agents: agents ?? [], calls: calls ?? null,
        weekly: weekly ?? [], ltData: ltData ?? [],
        maxDate, callsMaxDate,
        generatedAt: new Date().toLocaleString('pt-PT'),
        adoptionBefore: kpisBefore?.adoption_rate ?? null,
        adoptionBeforeDate: beforeDateStr,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Draw all charts when data changes
  useEffect(() => {
    if (!data) return;

    // Destroy previous instances
    Object.values(chartInstances.current).forEach(c => c.destroy());
    chartInstances.current = {};

    // Draw LT charts
    if (data.ltData.length > 0) {
      drawLtChart('lt-all', data.ltData, 'all');
      drawLtChart('lt-gd', data.ltData, 'gd');
      drawLtChart('lt-peri', data.ltData, 'peritagem');
    }
    // Draw calls chart
    if (data.weekly.length > 0) {
      drawCallsChart('calls-chart', data.weekly);
    }
  }, [data]);

  function drawLtChart(id: string, allLtData: LtRow[], mode: 'all' | 'gd' | 'peritagem') {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    if (!canvas) return;

    // Filter to the relevant expertise subset for this chart
    const expertiseFilter = mode === 'gd' ? 'Gestão Direta' : mode === 'peritagem' ? 'Peritagem' : null;
    const ltData = expertiseFilter ? allLtData.filter(d => d.expertise_type === expertiseFilter) : allLtData;

    const allLabels = sortWeekLabels(Array.from(new Set(allLtData.map(d => d.week_label))), allLtData);

    // Aggregate LT by channel (across whatever expertise subset is active for this chart)
    function aggCh(channel: string) {
      return allLabels.map(w => {
        const rows = ltData.filter(d => d.week_label === w && d.channel === channel);
        const valid = rows.filter(r => r.avg_lt_total != null);
        if (!valid.length) return null;
        const sumLt = valid.reduce((s, r) => s + (r.avg_lt_total ?? 0) * r.total, 0);
        const tot = valid.reduce((s, r) => s + r.total, 0);
        return tot > 0 ? Math.round(sumLt / tot * 10) / 10 : null;
      });
    }

    const ltNovo = aggCh('Formulário Novo');
    const ltAntigo = aggCh('Formulário Antigo');

    const prefix = mode === 'gd' ? 'LT GD' : mode === 'peritagem' ? 'LT Per.' : 'LT';

    // Bars: closed occurrence counts for this mode
    const novoBar = allLabels.map(w =>
      ltData.filter(d => d.week_label === w && d.channel === 'Formulário Novo').reduce((s, r) => s + r.total, 0) || null
    );
    const antigoBar = allLabels.map(w =>
      ltData.filter(d => d.week_label === w && d.channel === 'Formulário Antigo').reduce((s, r) => s + r.total, 0) || null
    );

    const datasets: object[] = [
      { type: 'bar', label: 'Form. Novo', data: novoBar, backgroundColor: '#00B4A055', borderColor: '#00B4A0', borderWidth: 1, borderRadius: 2, yAxisID: 'y2', order: 3 },
      { type: 'bar', label: 'Form. Antigo', data: antigoBar, backgroundColor: '#E8007D44', borderColor: '#E8007D', borderWidth: 1, borderRadius: 2, yAxisID: 'y2', order: 3 },
      { type: 'line', label: `${prefix} — Novo`, data: ltNovo, borderColor: '#00B4A0', borderWidth: 2, pointRadius: 2, tension: 0.3, yAxisID: 'y', order: 1, spanGaps: true, backgroundColor: 'transparent' },
      { type: 'line', label: `${prefix} — Antigo`, data: ltAntigo, borderColor: '#E8007D', borderWidth: 2, borderDash: [4, 3], pointRadius: 2, tension: 0.3, yAxisID: 'y', order: 1, spanGaps: true, backgroundColor: 'transparent' },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chartInstances.current[id] = new ChartJS(canvas, { type: 'bar', data: { labels: allLabels, datasets: datasets as any }, options: {
      responsive: true, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 10, padding: 8 } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
        y: { position: 'left', beginAtZero: true, title: { display: true, text: 'Dias úteis', font: { size: 9 } }, ticks: { font: { size: 9 } } },
        y2: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Ocorrências enc.', font: { size: 9 } }, ticks: { font: { size: 9 }, stepSize: 5 } },
      },
    } as any });
  }

  function drawCallsChart(id: string, weekly: WeeklyCall[]) {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    if (!canvas) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chartInstances.current[id] = new ChartJS(canvas, { type: 'bar', data: {
      labels: weekly.map(w => w.week_label),
      datasets: [
        { type: 'bar', label: 'Chamadas no horário', data: weekly.map(w => w.within_hours), backgroundColor: '#00B4A0cc', borderRadius: 3, yAxisID: 'y', order: 2 },
        { type: 'line', label: '% Atendidas', data: weekly.map(w => Math.round(w.answer_rate_within_hours * 10) / 10), borderColor: '#00305E', backgroundColor: '#00305E22', borderWidth: 2, pointRadius: 3, tension: 0.3, yAxisID: 'y1', order: 1 },
        { type: 'line', label: '% Abandonadas', data: weekly.map(w => w.within_hours > 0 ? Math.round(w.abandoned / w.within_hours * 1000) / 10 : 0), borderColor: '#E8007D', borderWidth: 2, borderDash: [4, 4], pointRadius: 3, tension: 0.3, yAxisID: 'y1', order: 1 },
      ],
    } as any, options: {
      responsive: true, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 10 } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: { position: 'left', beginAtZero: true, title: { display: true, text: 'Chamadas', font: { size: 9 } }, ticks: { font: { size: 9 } } },
        y1: { position: 'right', beginAtZero: true, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '%', font: { size: 9 } }, ticks: { font: { size: 9 }, callback: (v: number | string) => `${v}%` } },
      },
    } as any });
  }

  const waves = data ? Array.from(new Set(data.agents.map(a => a.wave_number))).sort() : [];
  const waveStats = waves.map(w => {
    const agents = data!.agents.filter(a => a.wave_number === w);
    const novo = agents.reduce((s, a) => s + a.novo, 0);
    const antigo = agents.reduce((s, a) => s + a.antigo, 0);
    const email = agents.reduce((s, a) => s + a.email_outro, 0);
    const total = agents.reduce((s, a) => s + a.total, 0);
    const adoption = (novo + antigo) > 0 ? Math.round(novo / (novo + antigo) * 1000) / 10 : null;
    const novo7d = agents.reduce((s, a) => s + (a.novo_7d ?? 0), 0);
    const antigo7d = agents.reduce((s, a) => s + (a.antigo_7d ?? 0), 0);
    const adoption7d = (novo7d + antigo7d) > 0 ? Math.round(novo7d / (novo7d + antigo7d) * 1000) / 10 : null;
    const waveName = agents[0]?.wave_name ?? `Wave ${w}`;
    return { wave: w, waveName, agents, novo, antigo, email, total, adoption, adoption7d };
  });

  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Controls — hidden on print */}
      <div className="no-print bg-[#00305E] text-white px-6 py-3 flex flex-wrap items-center gap-4 sticky top-0 z-50 shadow-lg">
        <div className="shrink-0">
          <h1 className="font-bold text-base leading-none">Gerador de Report</h1>
          <p className="text-xs text-blue-200 mt-0.5">Status Piloto Agentes — Form. Novo</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-100 whitespace-nowrap">Corte piloto:</span>
            <input type="date" value={maxDate} onChange={e => setMaxDate(e.target.value)} max={today}
              className="px-2.5 py-1.5 rounded-lg text-[#00305E] text-sm font-medium bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-100 whitespace-nowrap">Corte chamadas:</span>
            <input type="date" value={callsMaxDate} onChange={e => setCallsMaxDate(e.target.value)} max={today}
              className="px-2.5 py-1.5 rounded-lg text-[#00305E] text-sm font-medium bg-white" />
          </div>
          <button onClick={generate} disabled={loading}
            className="px-4 py-1.5 bg-[#00B4A0] text-white text-sm font-semibold rounded-lg hover:bg-teal-600 disabled:opacity-50 transition">
            {loading ? 'A gerar…' : 'Gerar Report'}
          </button>
          {data && (
            <button onClick={() => window.print()}
              className="px-4 py-1.5 bg-white text-[#00305E] text-sm font-semibold rounded-lg hover:bg-blue-50 transition">
              Exportar PDF
            </button>
          )}
          <a href="/dashboard" className="text-xs text-blue-200 hover:text-white underline">← Dashboard</a>
        </div>
      </div>

      {!data && !loading && !error && (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="w-16 h-16 bg-[#00305E] rounded-full flex items-center justify-center mx-auto mb-4 opacity-20">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Define as datas de corte e clica em <strong>Gerar Report</strong></p>
            <p className="text-gray-400 text-sm mt-1">Podes usar datas de corte diferentes para o piloto e para as chamadas</p>
          </div>
        </div>
      )}

      {error && <div className="max-w-xl mx-auto mt-12 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {loading && (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="animate-spin h-10 w-10 border-2 border-[#00305E] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">A carregar dados…</p>
          </div>
        </div>
      )}

      {data && (
        <div className="report-container">
          {/* CAPA */}
          <div className="report-page cover-page">
            <div className="cover-logo">TOM HOUSEHOLD | PHASE 2</div>
            <div className="cover-title">STATUS PILOTO AGENTES<br />FORMULÁRIO NOVO</div>
            <div className="cover-meta">
              <div>Dados piloto até: <strong>{fmtDate(data.maxDate)}</strong></div>
              <div>Dados chamadas até: <strong>{fmtDate(data.callsMaxDate)}</strong></div>
              <div>Gerado em: {data.generatedAt}</div>
              <div>Ramo: Riscos Múltiplos — Habitação</div>
            </div>
            <div className="cover-waves">
              <div className="cover-wave-chip">WAVE 1 — 27 Mar 2026</div>
              <div className="cover-wave-chip">WAVE 2 — 11 Mai 2026</div>
              <div className="cover-wave-chip">WAVE 3 — 14 Jul 2026</div>
              <div className="cover-wave-chip">WAVE 4 — 30 Jul 2026</div>
            </div>
          </div>

          {/* HIGHLIGHTS */}
          {(() => {
            const rd = data!;
            // 7-day adoption from agents
            const total7dNovo = rd.agents.reduce((s, a) => s + (a.novo_7d ?? 0), 0);
            const total7dAntigo = rd.agents.reduce((s, a) => s + (a.antigo_7d ?? 0), 0);
            const adoption7d = (total7dNovo + total7dAntigo) > 0
              ? Math.round(total7dNovo / (total7dNovo + total7dAntigo) * 1000) / 10 : null;
            // Agents opening new form for the first time this week
            const firstTimers = rd.agents.filter(a => (a.novo_7d ?? 0) > 0 && a.novo === (a.novo_7d ?? 0));
            // Agents that never opened new form but have antigo (need intervention)
            const neverNovo = rd.agents.filter(a => a.novo === 0 && a.antigo > 0);
            // Weighted LT by channel from ltData
            function ltByChannel(ch: string) {
              const rows = rd.ltData.filter(r => r.channel === ch && r.avg_lt_total != null);
              const totalW = rows.reduce((s, r) => s + r.total, 0);
              if (!totalW) return null;
              return Math.round(rows.reduce((s, r) => s + (r.avg_lt_total ?? 0) * r.total, 0) / totalW * 10) / 10;
            }
            function ltOAByChannel(ch: string) {
              const rows = rd.ltData.filter(r => r.channel === ch && r.avg_lt_opening_acceptance != null);
              const totalW = rows.reduce((s, r) => s + r.total, 0);
              if (!totalW) return null;
              return Math.round(rows.reduce((s, r) => s + (r.avg_lt_opening_acceptance ?? 0) * r.total, 0) / totalW * 10) / 10;
            }
            const ltNovo = ltByChannel('Formulário Novo');
            const ltAntigo = ltByChannel('Formulário Antigo');
            const ltOANovo = ltOAByChannel('Formulário Novo');
            const LT_REF_2025 = 33.6;
            const ltDelta = rd.kpis.avg_lt_total != null ? Math.round((rd.kpis.avg_lt_total - LT_REF_2025) * 10) / 10 : null;
            // 7-day window label
            const refD = new Date(rd.maxDate + 'T12:00:00');
            const startD = new Date(refD); startD.setDate(startD.getDate() - 6);
            const fmtShort = (dt: Date) => dt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
            return (
              <div className="report-page highlights-page">
                <div className="section-title">Destaques da Semana</div>
                <div className="section-subtitle">Dados piloto até {fmtDate(rd.maxDate)} · Janela de referência: {fmtShort(startD)} – {fmtShort(refD)}</div>
                <div className="highlights-grid">

                  {/* CARD 1 — Adoção */}
                  <div className="hl-card hl-teal">
                    <div className="hl-card-header">
                      <div className="hl-card-label">Taxa de Adoção</div>
                      <div className="hl-card-value">{fmt(rd.kpis.adoption_rate, '%')}</div>
                      <div className="hl-card-sub">
                        {rd.adoptionBefore !== null ? `${rd.adoptionBefore}%` : '—'}
                        {' (até '}{fmtShort(startD)}{') → '}
                        {fmt(rd.kpis.adoption_rate, '%')}
                        {' (até '}{fmtShort(refD)}{')'}
                      </div>
                    </div>
                    <div className="hl-card-bullets">
                      <div className="hl-bullet">
                        <span className="hl-bullet-icon">+</span>
                        <span className="hl-bullet-key">AGEs com 1.ª abertura de Form. Novo esta semana</span>
                        <span className="hl-bullet-val hl-teal-txt">{firstTimers.length} AGE{firstTimers.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="hl-bullet">
                        <span className="hl-bullet-icon">⚠</span>
                        <span className="hl-bullet-key">AGEs sem Form. Novo mas com Form. Antigo</span>
                        <span className="hl-bullet-val hl-warn-txt">{neverNovo.length} AGE{neverNovo.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="hl-card-note">Inclui todos os canais elegíveis · Baseado na data limite selecionada</div>
                  </div>

                  {/* CARD 2 — GD */}
                  <div className="hl-card hl-navy">
                    <div className="hl-card-header">
                      <div className="hl-card-label">% Gestão Direta</div>
                      <div className="hl-card-value">{fmt(rd.kpis.gd_rate_global, '%')}</div>
                      <div className="hl-card-sub">todos os casos elegíveis (abertos e encerrados)</div>
                    </div>
                    <div className="hl-card-bullets">
                      <div className="hl-bullet">
                        <span className="hl-bullet-icon">●</span>
                        <span className="hl-bullet-key">%GD Form. Novo (encerrados)</span>
                        <span className="hl-bullet-val hl-teal-txt">{fmt(rd.kpis.gd_rate_novo_closed, '%')}</span>
                      </div>
                      <div className="hl-bullet">
                        <span className="hl-bullet-icon">●</span>
                        <span className="hl-bullet-key">%GD Form. Antigo (encerrados)</span>
                        <span className="hl-bullet-val hl-pink-txt">{fmt(rd.kpis.gd_rate_antigo_closed, '%')}</span>
                      </div>
                    </div>
                    <div className="hl-card-note">% GD = processos sem peritagem / total · Encerrados = com data de fecho</div>
                  </div>

                  {/* CARD 3 — LT */}
                  <div className="hl-card hl-orange">
                    <div className="hl-card-header">
                      <div className="hl-card-label">Lead Time Piloto</div>
                      <div className="hl-card-value">{fmt(rd.kpis.avg_lt_total, ' dias')}</div>
                      <div className="hl-card-sub">Baseline {LT_REF_2025} d</div>
                    </div>
                    <div className="hl-card-bullets">
                      <div className="hl-bullet">
                        <span className="hl-bullet-icon">●</span>
                        <span className="hl-bullet-key">LT Form. Novo vs. Form. Antigo</span>
                        <span className="hl-bullet-val">
                          <span className="hl-teal-txt">{fmt(ltNovo, ' d')}</span>
                          {' vs. '}
                          <span className="hl-pink-txt">{fmt(ltAntigo, ' d')}</span>
                        </span>
                      </div>
                      <div className="hl-bullet">
                        <span className="hl-bullet-icon">◎</span>
                        <span className="hl-bullet-key">LT Abertura → Aceitação (Form. Novo)</span>
                        <span className="hl-bullet-val hl-teal-txt">{fmt(ltOANovo, ' dias')}</span>
                      </div>
                    </div>
                    <div className="hl-card-note">Apenas casos encerrados · dias úteis · LT total = data participação → data fecho</div>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* RESUMO GLOBAL */}
          <div className="report-page">
            <div className="section-title">Resumo Global do Piloto</div>
            <div className="kpi-grid-4">
              <div className="kpi-box navy"><div className="kpi-label">Total Ocorrências</div><div className="kpi-value">{data.kpis.total_eligible}</div></div>
              <div className="kpi-box teal"><div className="kpi-label">Formulário Novo</div><div className="kpi-value">{data.kpis.total_novo}</div></div>
              <div className="kpi-box pink"><div className="kpi-label">Formulário Antigo</div><div className="kpi-value">{data.kpis.total_antigo}</div></div>
              <div className="kpi-box gray"><div className="kpi-label">Email / Outro</div><div className="kpi-value">{data.kpis.total_email}</div></div>
            </div>
            <div className="adoption-highlight">
              <div className="adoption-big">{fmt(data.kpis.adoption_rate, '%')}</div>
              <div className="adoption-label">Taxa de Adoção Global<br /><span style={{fontWeight:'normal',fontSize:'0.75rem'}}>Formulário Novo / (Novo + Antigo)</span></div>
            </div>
            <div className="kpi-grid-4" style={{marginTop:'1rem'}}>
              <div className="kpi-box navy"><div className="kpi-label">% GD Global</div><div className="kpi-value">{fmt(data.kpis.gd_rate_global, '%')}</div></div>
              <div className="kpi-box teal"><div className="kpi-label">% GD Novo Form.</div><div className="kpi-value">{fmt(data.kpis.gd_rate_novo, '%')}</div></div>
              <div className="kpi-box pink"><div className="kpi-label">% GD Antigo Form.</div><div className="kpi-value">{fmt(data.kpis.gd_rate_antigo, '%')}</div></div>
              <div className="kpi-box orange"><div className="kpi-label">LT Médio GD</div><div className="kpi-value">{fmt(data.kpis.avg_lt_gd, ' d')}</div></div>
            </div>
            <div className="section-subtitle" style={{marginTop:'1.5rem'}}>Resumo por Wave</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Wave</th><th>Mediadoras</th>
                  <th className="num">Form. Novo</th><th className="num">Form. Antigo</th>
                  <th className="num">Email/Outro</th><th className="num">Total</th>
                  <th className="num">% Adoção</th><th className="num">% Adoção 7d</th>
                </tr>
              </thead>
              <tbody>
                {waveStats.map(ws => (
                  <tr key={ws.wave}>
                    <td style={{fontWeight:'600',color:'#00305E'}}>{ws.waveName}</td>
                    <td>{ws.agents.length}</td>
                    <td className="num teal">{ws.novo}</td><td className="num pink">{ws.antigo}</td>
                    <td className="num gray">{ws.email}</td><td className="num bold">{ws.total}</td>
                    <td className="num"><span className={`badge ${(ws.adoption ?? 0) >= 50 ? 'badge-good' : 'badge-warn'}`}>{fmt(ws.adoption, '%')}</span></td>
                    <td className="num">{ws.adoption7d !== null ? <span className={`badge ${(ws.adoption7d ?? 0) >= 50 ? 'badge-good' : 'badge-warn'}`}>{fmt(ws.adoption7d, '%')}</span> : '—'}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={2}><strong>Total</strong></td>
                  <td className="num teal"><strong>{data.kpis.total_novo}</strong></td>
                  <td className="num pink"><strong>{data.kpis.total_antigo}</strong></td>
                  <td className="num gray"><strong>{data.kpis.total_email}</strong></td>
                  <td className="num bold"><strong>{data.kpis.total_eligible}</strong></td>
                  <td className="num"><span className={`badge ${data.kpis.adoption_rate >= 50 ? 'badge-good' : 'badge-warn'}`}>{fmt(data.kpis.adoption_rate, '%')}</span></td>
                  <td className="num">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* POR WAVE */}
          {waveStats.map(ws => (
            <div key={ws.wave} className="report-page">
              <div className="section-title">Adoção por Mediadora — {ws.waveName}</div>
              <div className="wave-header-row">
                <div className="wave-stat"><span className="wave-stat-label">Mediadoras</span><span className="wave-stat-value">{ws.agents.length}</span></div>
                <div className="wave-stat"><span className="wave-stat-label">Form. Novo</span><span className="wave-stat-value teal">{ws.novo}</span></div>
                <div className="wave-stat"><span className="wave-stat-label">Form. Antigo</span><span className="wave-stat-value pink">{ws.antigo}</span></div>
                <div className="wave-stat"><span className="wave-stat-label">Taxa Adoção</span><span className={`wave-stat-value ${(ws.adoption ?? 0) >= 50 ? 'teal' : 'warn'}`}>{fmt(ws.adoption, '%')}</span></div>
                <div className="wave-stat"><span className="wave-stat-label">Adoção 7d</span><span className={`wave-stat-value ${(ws.adoption7d ?? 0) >= 50 ? 'teal' : 'warn'}`}>{ws.adoption7d !== null ? fmt(ws.adoption7d, '%') : '—'}</span></div>
              </div>
              <table className="report-table" style={{marginTop:'0.75rem'}}>
                <thead>
                  <tr>
                    <th>Mediadora</th>
                    <th className="num">Form. Novo</th><th className="num">Form. Antigo</th>
                    <th className="num">Email/Outro</th><th className="num">Total</th>
                    <th className="num">% Adoção</th><th className="num">% Adoção 7d</th>
                  </tr>
                </thead>
                <tbody>
                  {ws.agents.map(a => {
                    const good = (a.adoption_rate ?? 0) >= 50;
                    const hasAdopt = a.adoption_rate !== null;
                    const good7d = (a.adoption_last7d ?? 0) >= 50;
                    const has7d = a.adoption_last7d != null;
                    return (
                      <tr key={a.agent_code}>
                        <td style={{fontWeight:'500'}}>
                          <span className={hasAdopt ? (good ? 'icon-good' : 'icon-warn') : 'icon-na'}>{hasAdopt ? (good ? '✓' : '⚠') : '—'}</span>
                          {' '}{a.agent_name ?? a.agent_code}
                        </td>
                        <td className="num teal">{a.novo}</td><td className="num pink">{a.antigo}</td>
                        <td className="num gray">{a.email_outro}</td><td className="num bold">{a.total}</td>
                        <td className="num">{hasAdopt ? <span className={`badge ${good ? 'badge-good' : 'badge-warn'}`}>{fmt(a.adoption_rate, '%')}</span> : '—'}</td>
                        <td className="num">{has7d ? <span className={`badge ${good7d ? 'badge-good' : 'badge-warn'}`}>{fmt(a.adoption_last7d, '%')}</span> : '—'}</td>
                      </tr>
                    );
                  })}
                  <tr className="total-row">
                    <td><strong>Total {ws.waveName}</strong></td>
                    <td className="num teal"><strong>{ws.novo}</strong></td><td className="num pink"><strong>{ws.antigo}</strong></td>
                    <td className="num gray"><strong>{ws.email}</strong></td><td className="num bold"><strong>{ws.total}</strong></td>
                    <td className="num"><span className={`badge ${(ws.adoption ?? 0) >= 50 ? 'badge-good' : 'badge-warn'}`}>{fmt(ws.adoption, '%')}</span></td>
                    <td className="num">{ws.adoption7d !== null ? <span className={`badge ${(ws.adoption7d ?? 0) >= 50 ? 'badge-good' : 'badge-warn'}`}>{fmt(ws.adoption7d, '%')}</span> : '—'}</td>
                  </tr>
                </tbody>
              </table>
              <div className="legend-row">
                <span className="icon-good">✓</span> Taxa adoção ≥ 50%&nbsp;&nbsp;
                <span className="icon-warn">⚠</span> Taxa adoção &lt; 50% — requer intervenção
              </div>
            </div>
          ))}

          {/* LEAD TIMES — KPI resumo */}
          <div className="report-page">
            <div className="section-title">Lead Times — Casos Encerrados</div>
            <div className="kpi-grid-4">
              <div className="kpi-box navy"><div className="kpi-label">LT Global</div><div className="kpi-value">{fmt(data.kpis.avg_lt_total, ' d')}</div></div>
              <div className="kpi-box teal"><div className="kpi-label">LT Gestão Direta</div><div className="kpi-value">{fmt(data.kpis.avg_lt_gd, ' d')}</div></div>
              <div className="kpi-box pink"><div className="kpi-label">LT Peritagem</div><div className="kpi-value">{fmt(data.kpis.avg_lt_expertise, ' d')}</div></div>
              <div className="kpi-box orange"><div className="kpi-label">LT Abertura→Aceit.</div><div className="kpi-value">{fmt(data.kpis.avg_lt_opening_acceptance, ' d')}</div></div>
            </div>
            <div className="kpi-grid-4" style={{marginTop:'0.75rem'}}>
              <div className="kpi-box teal"><div className="kpi-label">Ocorrências GD</div><div className="kpi-value">{fmt(data.kpis.total_gd_base)}</div><div className="kpi-sub">{fmt(data.kpis.closed_gd_count_base)} encerradas</div></div>
              <div className="kpi-box orange"><div className="kpi-label">Ocorrências Peritagem</div><div className="kpi-value">{fmt(data.kpis.total_peritagem_base)}</div><div className="kpi-sub">{fmt(data.kpis.closed_peritagem_count_base)} encerradas</div></div>
              <div className="kpi-box gray" style={{gridColumn:'span 2'}}>
                <div className="kpi-label" style={{textAlign:'left'}}>Potencial GD</div>
                <div style={{fontSize:'0.85rem',color:'#374151',marginTop:'0.25rem'}}>
                  {data.kpis.gd_rate_novo && data.kpis.gd_rate_antigo && data.kpis.gd_rate_antigo > 0
                    ? `Novo Form. tem ${(data.kpis.gd_rate_novo / data.kpis.gd_rate_antigo).toFixed(1)}x mais potencial GD (${fmt(data.kpis.gd_rate_novo, '%')} vs ${fmt(data.kpis.gd_rate_antigo, '%')})`
                    : '—'}
                </div>
              </div>
            </div>
            <p className="legend-row" style={{marginTop:'1rem'}}>Linhas = LT médio em dias úteis (eixo esq.) · Barras = ocorrências encerradas por semana (eixo dir.) · Nas páginas seguintes: detalhe por segmento</p>
          </div>

          {/* LEAD TIMES — Todos os casos */}
          {data.ltData.length > 0 && (
            <div className="report-page">
              <div className="section-title">Lead Times — Todos os Casos</div>
              <div className="section-subtitle">LT agregado por canal de entrada (Form. Novo vs Form. Antigo), independentemente de GD ou Peritagem</div>
              <canvas id="lt-all" height={200} style={{marginTop:'1rem'}} />
            </div>
          )}

          {/* LEAD TIMES — Gestão Direta */}
          {data.ltData.length > 0 && (
            <div className="report-page">
              <div className="section-title">Lead Times — Gestão Direta</div>
              <div className="section-subtitle">Apenas ocorrências sem peritagem · {fmt(data.kpis.closed_gd_count_base)} casos encerrados</div>
              <canvas id="lt-gd" height={200} style={{marginTop:'1rem'}} />
            </div>
          )}

          {/* LEAD TIMES — Peritagem */}
          {data.ltData.length > 0 && (
            <div className="report-page">
              <div className="section-title">Lead Times — Peritagem</div>
              <div className="section-subtitle">Apenas ocorrências com peritagem · {fmt(data.kpis.closed_peritagem_count_base)} casos encerrados</div>
              <canvas id="lt-peri" height={200} style={{marginTop:'1rem'}} />
            </div>
          )}

          {/* LINHA DE APOIO */}
          {data.calls && data.calls.total > 0 && (
            <div className="report-page">
              <div className="section-title">Linha de Apoio Agentes — Volume de Chamadas</div>
              <div className="section-subtitle">Dados até {fmtDate(data.callsMaxDate)} · Horário de funcionamento: 08h45 – 16h45</div>
              <div className="kpi-grid-3" style={{marginTop:'1rem'}}>
                <div className="kpi-box teal">
                  <div className="kpi-value" style={{fontSize:'2rem',color:'#00B4A0'}}>{data.calls.withinHoursTotal}</div>
                  <div className="kpi-label">chamadas totais no horário</div>
                </div>
                <div className="kpi-box navy">
                  <div className="kpi-value" style={{fontSize:'2rem',color:'#00305E'}}>{fmt(data.calls.answerRateWithin, '%')}</div>
                  <div className="kpi-label">chamadas atendidas no horário</div>
                  <div className="kpi-sub">{(100 - data.calls.answerRateWithin).toFixed(1)}% não atendidas</div>
                </div>
                <div className="kpi-box pink">
                  <div className="kpi-value" style={{fontSize:'2rem',color:'#E8007D'}}>{fmt(data.calls.avgDurationMinutes, ' min')}</div>
                  <div className="kpi-label">duração média / chamada</div>
                </div>
              </div>

              {data.weekly.length > 0 && (
                <div style={{marginTop:'1.5rem'}}>
                  <p className="chart-label" style={{marginBottom:'0.5rem'}}>Atendimento Semanal — Dentro do Horário (08h45 – 16h45)</p>
                  <canvas id="calls-chart" height={120} />
                </div>
              )}

              {data.calls.outsideHours > 0 && (
                <div className="outside-alert">
                  <span style={{fontSize:'1.5rem',fontWeight:'800',color:'#d97706'}}>{data.calls.outsideHours}</span>
                  <span style={{marginLeft:'0.75rem',fontSize:'0.9rem',fontWeight:'600',color:'#92400e'}}>Chamadas Fora do Horário de Atendimento</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        .report-container { font-family: 'Inter', system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem 4rem; }
        .report-page { background: white; border-radius: 12px; padding: 2rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .cover-page { background: #00305E; color: white; text-align: center; padding: 3rem 2rem; }
        .cover-logo { font-size: 0.8rem; letter-spacing: 0.15em; color: #93c5fd; margin-bottom: 2rem; font-weight: 500; }
        .cover-title { font-size: 2rem; font-weight: 800; line-height: 1.2; margin-bottom: 2rem; }
        .cover-meta { font-size: 0.9rem; color: #bfdbfe; line-height: 2; margin-bottom: 2rem; }
        .cover-waves { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
        .cover-wave-chip { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 20px; padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 500; }
        .section-title { font-size: 1.1rem; font-weight: 700; color: #00305E; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e5e7eb; }
        .section-subtitle { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.5rem; }
        .kpi-grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 0.75rem; }
        .kpi-grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.75rem; }
        .kpi-box { border-radius: 10px; padding: 1rem; text-align: center; }
        .kpi-box.navy { background: #eff6ff; } .kpi-box.teal { background: #f0fdfa; }
        .kpi-box.pink { background: #fdf2f8; } .kpi-box.orange { background: #fffbeb; }
        .kpi-box.gray { background: #f9fafb; }
        .kpi-label { font-size: 0.7rem; color: #6b7280; margin-bottom: 0.25rem; }
        .kpi-value { font-size: 1.5rem; font-weight: 700; color: #00305E; }
        .kpi-sub { font-size: 0.65rem; color: #9ca3af; margin-top: 0.2rem; }
        .adoption-highlight { display: flex; align-items: center; gap: 1.5rem; background: #f0fdfa; border-radius: 10px; padding: 1.25rem 1.5rem; margin-top: 1rem; }
        .adoption-big { font-size: 3rem; font-weight: 800; color: #00B4A0; line-height: 1; }
        .adoption-label { font-size: 0.9rem; color: #374151; font-weight: 600; line-height: 1.4; }
        .report-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .report-table th { background: #f1f5f9; color: #374151; font-weight: 600; padding: 0.5rem 0.75rem; text-align: left; }
        .report-table th.num { text-align: right; }
        .report-table td { padding: 0.45rem 0.75rem; border-bottom: 1px solid #f1f5f9; color: #374151; }
        .report-table td.num { text-align: right; } .report-table td.teal { color: #00B4A0; font-weight: 600; }
        .report-table td.pink { color: #E8007D; } .report-table td.gray { color: #9ca3af; }
        .report-table td.bold { font-weight: 700; } .report-table .total-row { background: #eff6ff; font-weight: 700; }
        .badge { padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .badge-good { background: #d1fae5; color: #065f46; } .badge-warn { background: #fef3c7; color: #92400e; }
        .icon-good { color: #059669; font-weight: 700; } .icon-warn { color: #d97706; font-weight: 700; } .icon-na { color: #9ca3af; }
        .legend-row { margin-top: 0.5rem; font-size: 0.7rem; color: #6b7280; }
        .wave-header-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
        .wave-stat { display: flex; flex-direction: column; background: #f9fafb; border-radius: 8px; padding: 0.5rem 0.75rem; min-width: 90px; }
        .wave-stat-label { font-size: 0.65rem; color: #9ca3af; }
        .wave-stat-value { font-size: 1.1rem; font-weight: 700; color: #00305E; }
        .wave-stat-value.teal { color: #00B4A0; } .wave-stat-value.pink { color: #E8007D; }
        .wave-stat-value.warn { color: #d97706; } .wave-stat-value.navy { color: #00305E; }
        .lt-charts-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; }
        .chart-label { font-size: 0.75rem; font-weight: 600; color: #374151; margin-bottom: 0.25rem; }
        .outside-alert { display: flex; align-items: center; background: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 0.75rem 1.25rem; margin-top: 1rem; }

        /* Highlights slide */
        .highlights-page {}
        .highlights-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; margin-top: 1rem; }
        .hl-card { border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; border: 1px solid #e5e7eb; }
        .hl-card-header { padding: 1rem 1.25rem 0.875rem; }
        .hl-card-label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.75; margin-bottom: 0.35rem; }
        .hl-card-value { font-size: 2.4rem; font-weight: 800; line-height: 1; margin-bottom: 0.35rem; }
        .hl-card-sub { font-size: 0.68rem; opacity: 0.75; line-height: 1.35; }
        .hl-teal .hl-card-header { background: #0d9488; color: white; }
        .hl-navy .hl-card-header { background: #00305E; color: white; }
        .hl-orange .hl-card-header { background: #d97706; color: white; }
        .hl-card-bullets { flex: 1; padding: 0.875rem 1.25rem; display: flex; flex-direction: column; gap: 0.6rem; background: white; }
        .hl-bullet { display: flex; align-items: baseline; gap: 0.4rem; font-size: 0.75rem; color: #374151; }
        .hl-bullet-icon { font-size: 0.6rem; color: #9ca3af; flex-shrink: 0; width: 0.75rem; text-align: center; }
        .hl-bullet-key { flex: 1; color: #6b7280; }
        .hl-bullet-val { font-weight: 700; font-size: 0.8rem; color: #111827; white-space: nowrap; }
        .hl-teal-txt { color: #0d9488; }
        .hl-pink-txt { color: #E8007D; }
        .hl-warn-txt { color: #d97706; }
        .hl-navy-txt { color: #00305E; }
        .hl-card-note { padding: 0.5rem 1.25rem 0.625rem; font-size: 0.62rem; color: #9ca3af; border-top: 1px solid #f3f4f6; background: #fafafa; font-style: italic; }

        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .report-container { margin: 0; padding: 0; max-width: 100%; }
          .report-page { box-shadow: none; border-radius: 0; margin: 0; page-break-after: always; border: none; }
          .cover-page, .badge-good, .badge-warn, .kpi-box, .adoption-highlight, .wave-stat, .total-row, .outside-alert, .hl-card-header, .hl-card-note { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
