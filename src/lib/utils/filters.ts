export type DashboardFilters = {
  wave?: string;
  channel?: string;
  expertise?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters(query: any, filters: DashboardFilters) {
  if (filters.wave) query = query.eq('wave_number', Number(filters.wave));
  if (filters.channel) query = query.eq('channel', filters.channel);
  if (filters.expertise === 'true') query = query.eq('has_expertise', true);
  if (filters.expertise === 'false') query = query.eq('has_expertise', false);
  return query;
}

export function readFilters(searchParams: URLSearchParams): DashboardFilters {
  return {
    wave: searchParams.get('wave') ?? undefined,
    channel: searchParams.get('channel') ?? undefined,
    expertise: searchParams.get('expertise') ?? undefined,
  };
}

export function buildQS(filters: DashboardFilters): string {
  const p = new URLSearchParams();
  if (filters.wave) p.set('wave', filters.wave);
  if (filters.channel) p.set('channel', filters.channel);
  if (filters.expertise) p.set('expertise', filters.expertise);
  const s = p.toString();
  return s ? `?${s}` : '';
}
