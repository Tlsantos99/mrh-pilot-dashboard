'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

const SECTIONS = [
  { id: 'resumo', label: 'Resumo KPIs' },
  { id: 'adocao', label: 'Taxa de Adoção' },
  { id: 'gd', label: 'Gestão Direta' },
  { id: 'lead-times', label: 'Lead Times' },
  { id: 'agentes', label: 'Por Mediadora' },
  { id: 'chamadas', label: 'Linha de Apoio' },
  { id: 'fila', label: 'Fila de Espera' },
  { id: 'qualidade', label: 'Qualidade' },
];

const WAVES = [
  { value: '', label: 'Todas as Waves' },
  { value: '1', label: 'Wave 1' },
  { value: '2', label: 'Wave 2' },
  { value: '3', label: 'Wave 3' },
  { value: '4', label: 'Wave 4' },
];

const CHANNELS = [
  { value: '', label: 'Todos' },
  { value: 'Formulário Novo', label: 'Form. Novo' },
  { value: 'Formulário Antigo', label: 'Form. Antigo' },
  { value: 'Email/Outro', label: 'Email/Outro' },
];

const EXPERTISE = [
  { value: '', label: 'Todos' },
  { value: 'false', label: 'Gestão Direta' },
  { value: 'true', label: 'Com Peritagem' },
];

export default function DashboardSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const wave = sp.get('wave') ?? '';
  const channel = sp.get('channel') ?? '';
  const expertise = sp.get('expertise') ?? '';
  const hasFilters = wave || channel || expertise;

  const update = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  }, [sp, router, pathname]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <aside className="w-52 shrink-0 bg-white border-r border-gray-100 sticky top-0 h-screen flex flex-col overflow-y-auto">
      {/* Navigation */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Secções</p>
        <nav className="space-y-0.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="w-full text-left px-2.5 py-1.5 text-xs text-gray-600 rounded hover:bg-gray-50 hover:text-[#00305E] transition-colors"
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filters */}
      <div className="p-4 space-y-4 flex-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Filtros</p>

        <FilterGroup label="Wave" options={WAVES} value={wave} onChange={v => update('wave', v)} />
        <FilterGroup label="Canal de Entrada" options={CHANNELS} value={channel} onChange={v => update('channel', v)} />
        <FilterGroup label="Peritagem" options={EXPERTISE} value={expertise} onChange={v => update('expertise', v)} />

        {hasFilters && (
          <button
            onClick={() => router.push(pathname, { scroll: false })}
            className="w-full px-2.5 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </aside>
  );
}

function FilterGroup({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 mb-1.5">{label}</p>
      <div className="space-y-0.5">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors ${
              value === o.value
                ? 'bg-[#00305E] text-white font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
