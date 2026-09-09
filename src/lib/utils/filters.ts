export type DashboardFilters = {
  wave?: string;
  channel?: string;
  expertise?: string;
  status?: string; // 'open' | 'closed' | ''
  max_date?: string; // YYYY-MM-DD — upper bound on opening_date (inclusive)
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters(query: any, filters: DashboardFilters) {
  if (filters.wave) query = query.eq('wave_number', Number(filters.wave));
  if (filters.channel) query = query.eq('channel', filters.channel);
  if (filters.expertise === 'true') query = query.eq('has_expertise', true);
  if (filters.expertise === 'false') query = query.eq('has_expertise', false);
  if (filters.status === 'closed') query = query.not('closing_date', 'is', null);
  if (filters.status === 'open') query = query.is('closing_date', null);
  if (filters.max_date) query = query.lte('opening_date', filters.max_date);
  return query;
}

export function readFilters(searchParams: URLSearchParams): DashboardFilters {
  return {
    wave: searchParams.get('wave') ?? undefined,
    channel: searchParams.get('channel') ?? undefined,
    expertise: searchParams.get('expertise') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    max_date: searchParams.get('max_date') ?? undefined,
  };
}

export function buildQS(filters: DashboardFilters): string {
  const p = new URLSearchParams();
  if (filters.wave) p.set('wave', filters.wave);
  if (filters.channel) p.set('channel', filters.channel);
  if (filters.expertise) p.set('expertise', filters.expertise);
  if (filters.status) p.set('status', filters.status);
  if (filters.max_date) p.set('max_date', filters.max_date);
  const s = p.toString();
  return s ? `?${s}` : '';
}
