'use client';
import { useState, useRef } from 'react';

interface KPIs {
  total_eligible: number; total_novo: number; total_antigo: number; total_email: number;
  adoption_rate: number; gd_rate_global: number; gd_rate_novo: number; gd_rate_antigo: number;
  avg_lt_total: number | null; avg_lt_gd: number | null; avg_lt_expertise: number | null;
  avg_lt_opening_acceptance: number | null;
}

interface AgentRow {
  agent_code: string; agent_name: string; wave_number: number; wave_name: string;
  total: number; novo: number; antigo: number; email_outro: number;
  adoption_rate: number | null; gd_rate: number | null; avg_lt_total: number | null;
}

interface CallTotals {
  total: number; answered: number; answerRate: number;
  withinHoursTotal: number; answeredWithin: number; answerRateWithin: number;
  outsideHours: number; avgDurationMinutes: number;
}

interface ReportData {
  kpis: KPIs;
  agents: AgentRow[];
  calls: CallTotals | null;
  maxDate: string;
  generatedAt: string;
}

function fmt(n: number | null | undefined, suffix = '') {
  if (n === null || n === undefined) return '—';
  return `${n}${suffix}`;
}

function adocaoIcon(rate: number | null): string {
  if (rate === null) return '—';
  return rate >= 50 ? '✓' : '⚠';
}

export default function ReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [maxDate, setMaxDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const qs = `?max_date=${maxDate}`;
      const [summaryRes, agentsRes, callsRes] = await Promise.all([
        fetch(`/api/metrics/summary${qs}`),
        fetch(`/api/metrics/agents${qs}`),
        fetch('/api/metrics/calls'),
      ]);
      const { kpis } = await summaryRes.json();
      const { data: agents } = await agentsRes.json();
      const { totals: calls } = await callsRes.json();
      if (!kpis) throw new Error('Sem dados — verifique os filtros.');
      setData({
        kpis, agents: agents ?? [], calls: calls ?? null,
        maxDate,
        generatedAt: new Date().toLocaleString('pt-PT'),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function printReport() {
    window.print();
  }

  const waves = data ? Array.from(new Set(data.agents.map(a => a.wave_number))).sort() : [];

  const waveStats = waves.map(w => {
    const agents = data!.agents.filter(a => a.wave_number === w);
    const novo = agents.reduce((s, a) => s + a.novo, 0);
    const antigo = agents.reduce((s, a) => s + a.antigo, 0);
    const email = agents.reduce((s, a) => s + a.email_outro, 0);
    const total = agents.reduce((s, a) => s + a.total, 0);
    const adoption = (novo + antigo) > 0 ? Math.round(novo / (novo + antigo) * 1000) / 10 : null;
    const gd = total > 0 ? Math.round(agents.reduce((s, a) => s + (a.gd_rate ?? 0) * a.total, 0) / total * 10) / 10 : null;
    const waveName = agents[0]?.wave_name ?? `Wave ${w}`;
    return { wave: w, waveName, agents, novo, antigo, email, total, adoption, gd };
  });

  const maxDateLabel = data ? new Date(data.maxDate + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Controls bar — hidden on print */}
      <div className="no-print bg-[#00305E] text-white px-6 py-4 flex items-center gap-6 sticky top-0 z-50 shadow-lg">
        <div>
          <h1 className="font-bold text-lg">Gerador de Report</h1>
          <p className="text-xs text-blue-200">Status Piloto Agentes — Formulário Novo</p>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <label className="text-sm text-blue-100">Data de corte:</label>
          <input
            type="date"
            value={maxDate}
            onChange={e => setMaxDate(e.target.value)}
            max={today}
            className="px-3 py-1.5 rounded-lg text-[#00305E] text-sm font-medium bg-white"
          />
          <button
            onClick={generate}
            disabled={loading}
            className="px-5 py-2 bg-[#00B4A0] text-white text-sm font-semibold rounded-lg hover:bg-teal-600 disabled:opacity-50 transition"
          >
            {loading ? 'A gerar…' : 'Gerar Report'}
          </button>
          {data && (
            <button
              onClick={printReport}
              className="px-5 py-2 bg-white text-[#00305E] text-sm font-semibold rounded-lg hover:bg-blue-50 transition"
            >
              Exportar PDF
            </button>
          )}
          <a href="/dashboard" className="text-xs text-blue-200 hover:text-white underline ml-2">← Dashboard</a>
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
            <p className="text-gray-500 font-medium">Seleciona a data de corte e clica em <strong>Gerar Report</strong></p>
            <p className="text-gray-400 text-sm mt-1">O report irá incluir todos os dados até essa data</p>
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-xl mx-auto mt-12 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="animate-spin h-10 w-10 border-2 border-[#00305E] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">A carregar dados…</p>
          </div>
        </div>
      )}

      {data && (
        <div ref={reportRef} className="report-container">
          {/* ─── CAPA ─── */}
          <div className="report-page cover-page">
            <div className="cover-logo">TOM HOUSEHOLD | PHASE 2</div>
            <div className="cover-title">STATUS PILOTO AGENTES<br />FORMULÁRIO NOVO</div>
            <div className="cover-meta">
              <div>Dados até: <strong>{maxDateLabel}</strong></div>
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

          {/* ─── RESUMO GLOBAL ─── */}
          <div className="report-page">
            <div className="section-title">Resumo Global do Piloto</div>
            <div className="kpi-grid-4">
              <div className="kpi-box navy"><div className="kpi-label">Total Elegíveis</div><div className="kpi-value">{data.kpis.total_eligible}</div></div>
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

            {/* Wave summary table */}
            <div className="section-subtitle" style={{marginTop:'1.5rem'}}>Resumo por Wave</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Wave</th>
                  <th>Mediadoras</th>
                  <th className="num">Form. Novo</th>
                  <th className="num">Form. Antigo</th>
                  <th className="num">Email/Outro</th>
                  <th className="num">Total</th>
                  <th className="num">% Adoção</th>
                  <th className="num">% GD</th>
                </tr>
              </thead>
              <tbody>
                {waveStats.map(ws => (
                  <tr key={ws.wave}>
                    <td style={{fontWeight:'600',color:'#00305E'}}>{ws.waveName}</td>
                    <td>{ws.agents.length}</td>
                    <td className="num teal">{ws.novo}</td>
                    <td className="num pink">{ws.antigo}</td>
                    <td className="num gray">{ws.email}</td>
                    <td className="num bold">{ws.total}</td>
                    <td className="num">
                      <span className={`badge ${(ws.adoption ?? 0) >= 50 ? 'badge-good' : 'badge-warn'}`}>
                        {fmt(ws.adoption, '%')}
                      </span>
                    </td>
                    <td className="num">{fmt(ws.gd, '%')}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={2}><strong>Total</strong></td>
                  <td className="num teal"><strong>{data.kpis.total_novo}</strong></td>
                  <td className="num pink"><strong>{data.kpis.total_antigo}</strong></td>
                  <td className="num gray"><strong>{data.kpis.total_email}</strong></td>
                  <td className="num bold"><strong>{data.kpis.total_eligible}</strong></td>
                  <td className="num"><span className={`badge ${data.kpis.adoption_rate >= 50 ? 'badge-good' : 'badge-warn'}`}>{fmt(data.kpis.adoption_rate, '%')}</span></td>
                  <td className="num">{fmt(data.kpis.gd_rate_global, '%')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ─── POR WAVE: TABELA MEDIADORA ─── */}
          {waveStats.map(ws => (
            <div key={ws.wave} className="report-page">
              <div className="section-title">Adoção por Mediadora — {ws.waveName}</div>
              <div className="wave-header-row">
                <div className="wave-stat"><span className="wave-stat-label">Mediadoras</span><span className="wave-stat-value">{ws.agents.length}</span></div>
                <div className="wave-stat"><span className="wave-stat-label">Form. Novo</span><span className="wave-stat-value teal">{ws.novo}</span></div>
                <div className="wave-stat"><span className="wave-stat-label">Form. Antigo</span><span className="wave-stat-value pink">{ws.antigo}</span></div>
                <div className="wave-stat"><span className="wave-stat-label">Taxa Adoção</span><span className={`wave-stat-value ${(ws.adoption ?? 0) >= 50 ? 'teal' : 'warn'}`}>{fmt(ws.adoption, '%')}</span></div>
                <div className="wave-stat"><span className="wave-stat-label">% GD Novo</span><span className="wave-stat-value navy">{fmt(ws.gd, '%')}</span></div>
              </div>
              <table className="report-table" style={{marginTop:'0.75rem'}}>
                <thead>
                  <tr>
                    <th>Mediadora</th>
                    <th className="num">Form. Novo</th>
                    <th className="num">Form. Antigo</th>
                    <th className="num">Email/Outro</th>
                    <th className="num">Total</th>
                    <th className="num">% Adoção</th>
                    <th className="num">% GD</th>
                    <th className="num">LT Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {ws.agents.map(a => {
                    const good = (a.adoption_rate ?? 0) >= 50;
                    const hasAdoption = a.adoption_rate !== null;
                    return (
                      <tr key={a.agent_code}>
                        <td style={{fontWeight:'500'}}>
                          <span className={hasAdoption ? (good ? 'icon-good' : 'icon-warn') : 'icon-na'}>
                            {hasAdoption ? (good ? '✓' : '⚠') : '—'}
                          </span>
                          {' '}{a.agent_name ?? a.agent_code}
                        </td>
                        <td className="num teal">{a.novo}</td>
                        <td className="num pink">{a.antigo}</td>
                        <td className="num gray">{a.email_outro}</td>
                        <td className="num bold">{a.total}</td>
                        <td className="num">
                          {hasAdoption ? (
                            <span className={`badge ${good ? 'badge-good' : 'badge-warn'}`}>{fmt(a.adoption_rate, '%')}</span>
                          ) : '—'}
                        </td>
                        <td className="num">{fmt(a.gd_rate, '%')}</td>
                        <td className="num">{fmt(a.avg_lt_total, ' d')}</td>
                      </tr>
                    );
                  })}
                  <tr className="total-row">
                    <td><strong>Total {ws.waveName}</strong></td>
                    <td className="num teal"><strong>{ws.novo}</strong></td>
                    <td className="num pink"><strong>{ws.antigo}</strong></td>
                    <td className="num gray"><strong>{ws.email}</strong></td>
                    <td className="num bold"><strong>{ws.total}</strong></td>
                    <td className="num"><span className={`badge ${(ws.adoption ?? 0) >= 50 ? 'badge-good' : 'badge-warn'}`}>{fmt(ws.adoption, '%')}</span></td>
                    <td className="num">{fmt(ws.gd, '%')}</td>
                    <td className="num">—</td>
                  </tr>
                </tbody>
              </table>
              <div className="legend-row">
                <span className="icon-good">✓</span> Taxa adoção ≥ 50%&nbsp;&nbsp;
                <span className="icon-warn">⚠</span> Taxa adoção &lt; 50% — requer intervenção
              </div>
            </div>
          ))}

          {/* ─── LEAD TIMES ─── */}
          <div className="report-page">
            <div className="section-title">Lead Times — Casos Encerrados</div>
            <div className="kpi-grid-4">
              <div className="kpi-box navy"><div className="kpi-label">LT Global</div><div className="kpi-value">{fmt(data.kpis.avg_lt_total, ' d')}</div></div>
              <div className="kpi-box teal"><div className="kpi-label">LT Gestão Direta</div><div className="kpi-value">{fmt(data.kpis.avg_lt_gd, ' d')}</div></div>
              <div className="kpi-box pink"><div className="kpi-label">LT Peritagem</div><div className="kpi-value">{fmt(data.kpis.avg_lt_expertise, ' d')}</div></div>
              <div className="kpi-box orange"><div className="kpi-label">LT Abertura→Aceit.</div><div className="kpi-value">{fmt(data.kpis.avg_lt_opening_acceptance, ' d')}</div></div>
            </div>
            <div className="insight-box" style={{marginTop:'1.5rem'}}>
              <p>
                <strong>Potencial de Gestão Direta:</strong> {fmt(data.kpis.gd_rate_novo, '%')} nos sinistros por Formulário Novo vs.{' '}
                {fmt(data.kpis.gd_rate_antigo, '%')} no Formulário Antigo.{' '}
                {data.kpis.gd_rate_antigo && data.kpis.gd_rate_novo && data.kpis.gd_rate_antigo > 0
                  ? `O novo formulário tem ${(data.kpis.gd_rate_novo / data.kpis.gd_rate_antigo).toFixed(1)}x mais potencial de GD.`
                  : ''}
              </p>
            </div>
          </div>

          {/* ─── LINHA DE APOIO ─── */}
          {data.calls && data.calls.total > 0 && (
            <div className="report-page">
              <div className="section-title">Linha de Apoio Agentes</div>
              <div className="section-subtitle">Horário de funcionamento: 08h45 – 16h45</div>
              <div className="kpi-grid-4" style={{marginTop:'1rem'}}>
                <div className="kpi-box navy"><div className="kpi-label">Total Chamadas</div><div className="kpi-value">{data.calls.total}</div></div>
                <div className="kpi-box teal"><div className="kpi-label">% Atendidas (total)</div><div className="kpi-value">{fmt(data.calls.answerRate, '%')}</div></div>
                <div className="kpi-box teal"><div className="kpi-label">% Atendidas (horário)</div><div className="kpi-value">{fmt(data.calls.answerRateWithin, '%')}</div></div>
                <div className="kpi-box orange"><div className="kpi-label">Fora de Horário</div><div className="kpi-value">{data.calls.outsideHours}</div></div>
              </div>
              <div style={{textAlign:'center', marginTop:'1rem', fontSize:'0.85rem', color:'#6b7280'}}>
                Duração média por chamada: <strong>{fmt(data.calls.avgDurationMinutes, ' min')}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .report-container {
          font-family: 'Inter', system-ui, sans-serif;
          max-width: 960px;
          margin: 2rem auto;
          padding: 0 1rem 4rem;
        }
        .report-page {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .cover-page {
          background: #00305E;
          color: white;
          text-align: center;
          padding: 3rem 2rem;
        }
        .cover-logo { font-size: 0.8rem; letter-spacing: 0.15em; color: #93c5fd; margin-bottom: 2rem; font-weight: 500; }
        .cover-title { font-size: 2rem; font-weight: 800; line-height: 1.2; margin-bottom: 2rem; }
        .cover-meta { font-size: 0.9rem; color: #bfdbfe; line-height: 2; margin-bottom: 2rem; }
        .cover-waves { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
        .cover-wave-chip { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 20px; padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 500; }
        .section-title { font-size: 1.1rem; font-weight: 700; color: #00305E; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e5e7eb; }
        .section-subtitle { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.5rem; }
        .kpi-grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 0.75rem; }
        .kpi-box { border-radius: 10px; padding: 1rem; text-align: center; }
        .kpi-box.navy { background: #eff6ff; }
        .kpi-box.teal { background: #f0fdfa; }
        .kpi-box.pink { background: #fdf2f8; }
        .kpi-box.orange { background: #fffbeb; }
        .kpi-box.gray { background: #f9fafb; }
        .kpi-label { font-size: 0.7rem; color: #6b7280; margin-bottom: 0.25rem; }
        .kpi-value { font-size: 1.5rem; font-weight: 700; color: #00305E; }
        .adoption-highlight { display: flex; align-items: center; gap: 1.5rem; background: #f0fdfa; border-radius: 10px; padding: 1.25rem 1.5rem; margin-top: 1rem; }
        .adoption-big { font-size: 3rem; font-weight: 800; color: #00B4A0; line-height: 1; }
        .adoption-label { font-size: 0.9rem; color: #374151; font-weight: 600; line-height: 1.4; }
        .report-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .report-table th { background: #f1f5f9; color: #374151; font-weight: 600; padding: 0.5rem 0.75rem; text-align: left; }
        .report-table th.num { text-align: right; }
        .report-table td { padding: 0.45rem 0.75rem; border-bottom: 1px solid #f1f5f9; color: #374151; }
        .report-table td.num { text-align: right; }
        .report-table td.teal { color: #00B4A0; font-weight: 600; }
        .report-table td.pink { color: #E8007D; }
        .report-table td.gray { color: #9ca3af; }
        .report-table td.bold { font-weight: 700; }
        .report-table .total-row { background: #eff6ff; font-weight: 700; }
        .badge { padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .badge-good { background: #d1fae5; color: #065f46; }
        .badge-warn { background: #fef3c7; color: #92400e; }
        .icon-good { color: #059669; font-weight: 700; }
        .icon-warn { color: #d97706; font-weight: 700; }
        .icon-na { color: #9ca3af; }
        .legend-row { margin-top: 0.5rem; font-size: 0.7rem; color: #6b7280; }
        .wave-header-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
        .wave-stat { display: flex; flex-direction: column; background: #f9fafb; border-radius: 8px; padding: 0.5rem 0.75rem; min-width: 90px; }
        .wave-stat-label { font-size: 0.65rem; color: #9ca3af; }
        .wave-stat-value { font-size: 1.1rem; font-weight: 700; color: #00305E; }
        .wave-stat-value.teal { color: #00B4A0; }
        .wave-stat-value.pink { color: #E8007D; }
        .wave-stat-value.warn { color: #d97706; }
        .wave-stat-value.navy { color: #00305E; }
        .insight-box { background: #eff6ff; border-left: 3px solid #00305E; border-radius: 6px; padding: 0.75rem 1rem; font-size: 0.85rem; color: #374151; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .report-container { margin: 0; padding: 0; max-width: 100%; }
          .report-page { box-shadow: none; border-radius: 0; margin: 0; page-break-after: always; border: none; }
          .cover-page { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .badge-good, .badge-warn, .kpi-box, .adoption-highlight, .insight-box, .wave-stat, .total-row { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
