/**
 * Transform staging data into curated occurrences table.
 * All business rules are centralized here.
 */
import { businessDays, getISOWeek } from '@/lib/utils/business-days';
import { createServerClient } from '@/lib/supabase/server';

interface AgentMap {
  [agentCode: string]: {
    normalized_name: string | null;
    wave_number: number | null;
    wave_name: string | null;
    wave_start_date: string | null;
  };
}

interface PilotoSet { [occurrenceId: string]: string } // occurrenceId -> upload_id
interface AntigoSet { [occurrenceId: string]: string } // occurrenceId -> upload_id

export async function transformOccurrences(uploadId?: string) {
  const supabase = createServerClient();

  // 1. Load agent map
  const { data: agentRows } = await supabase
    .from('agents')
    .select('agent_code, normalized_name, wave_number, wave_name, wave_start_date');

  const agentMap: AgentMap = {};
  for (const a of agentRows ?? []) {
    if (a.agent_code) agentMap[a.agent_code] = a;
  }

  // 2. Load piloto occurrences set (Formulário Novo)
  const { data: pilotoRows } = await supabase
    .from('staging_piloto_agentes')
    .select('occurrence_id, upload_id')
    .not('occurrence_id', 'is', null);

  const pilotoSet: PilotoSet = {};
  for (const r of pilotoRows ?? []) {
    if (r.occurrence_id) pilotoSet[r.occurrence_id] = r.upload_id;
  }

  // 3. Load antigo occurrences set (Formulário Antigo)
  const { data: antigoRows } = await supabase
    .from('staging_formulario_antigo')
    .select('occurrence_id, upload_id')
    .not('occurrence_id', 'is', null);

  const antigoSet: AntigoSet = {};
  for (const r of antigoRows ?? []) {
    if (r.occurrence_id) antigoSet[r.occurrence_id] = r.upload_id;
  }

  // 4. Aggregate staging_global by occurrence_id
  const { data: globalRows } = await supabase
    .from('staging_global')
    .select('*')
    .order('occurrence_id')
    .order('process_number');

  if (!globalRows || globalRows.length === 0) return { processed: 0 };

  // Group by occurrence_id
  const grouped: Record<string, typeof globalRows> = {};
  for (const row of globalRows) {
    const oid = row.occurrence_id;
    if (!oid) continue;
    if (!grouped[oid]) grouped[oid] = [];
    grouped[oid].push(row);
  }

  const upsertBatch: Record<string, unknown>[] = [];

  for (const [occurrenceId, rows] of Object.entries(grouped)) {
    // Find main process: RIGHT(TRIM(process_number), 3) = '000'
    const mainProcess = rows.find(r => {
      const p = r.process_number?.trim() ?? '';
      return p.slice(-3) === '000';
    }) ?? rows[0];

    // Peritagem: any row has service_number OR expertise_costs > 0
    const hasExpertise = rows.some(r =>
      (r.service_number && r.service_number.trim() !== '') ||
      (r.expertise_costs !== null && r.expertise_costs !== undefined && parseFloat(String(r.expertise_costs)) > 0)
    );

    const serviceNumber = rows.find(r => r.service_number)?.service_number ?? null;
    const expertiseCosts = rows.reduce((sum, r) => sum + (parseFloat(String(r.expertise_costs ?? 0)) || 0), 0);

    // Event: any row has event_code
    const isEvent = rows.some(r => r.event_code && r.event_code.trim() !== '');
    const eventCode = rows.find(r => r.event_code)?.event_code ?? null;

    // Agent info from first row (they should all have same agent)
    const agentCode = mainProcess.agent_code?.trim() || null;
    const agent = agentCode ? agentMap[agentCode] : null;

    // Dates from main process /000
    const openingDate = mainProcess.opening_date ? new Date(mainProcess.opening_date) : null;
    const acceptanceDate = mainProcess.acceptance_date ? new Date(mainProcess.acceptance_date) : null;
    const closingDate = mainProcess.closing_date_accounting ? new Date(mainProcess.closing_date_accounting) : null;
    const participationDate = mainProcess.participation_date ? new Date(mainProcess.participation_date) : null;

    // Eligibility
    const waveStartDate = agent?.wave_start_date ? new Date(agent.wave_start_date) : null;
    const eligibleForPilot = !!(
      agent?.wave_number &&
      openingDate &&
      waveStartDate &&
      openingDate >= waveStartDate
    );

    // Channel (priority: Antigo > Novo > Email)
    let channel: 'Formulário Novo' | 'Formulário Antigo' | 'Email/Outro' = 'Email/Outro';
    let sourceUploadIdAntigo: string | null = null;
    let sourceUploadIdPiloto: string | null = null;

    if (antigoSet[occurrenceId]) {
      channel = 'Formulário Antigo';
      sourceUploadIdAntigo = antigoSet[occurrenceId];
    } else if (pilotoSet[occurrenceId]) {
      channel = 'Formulário Novo';
      sourceUploadIdPiloto = pilotoSet[occurrenceId];
    }

    // ISO Weeks
    const openingWeek = openingDate ? getISOWeek(openingDate) : null;
    const acceptanceWeek = acceptanceDate ? getISOWeek(acceptanceDate) : null;
    const closingWeek = closingDate ? getISOWeek(closingDate) : null;

    // Lead Times (business days)
    const ltOpeningAcceptance = businessDays(openingDate, acceptanceDate);
    const ltAcceptanceClosing = businessDays(acceptanceDate, closingDate);
    const ltTotal = businessDays(participationDate, closingDate);

    upsertBatch.push({
      occurrence_id: occurrenceId,
      main_process_id: mainProcess.process_number,
      agent_code: agentCode,
      agent_name: agent?.normalized_name ?? null,
      wave_number: agent?.wave_number ?? null,
      wave_name: agent?.wave_name ?? null,
      wave_start_date: agent?.wave_start_date ?? null,
      channel,
      has_expertise: hasExpertise,
      expertise_costs: expertiseCosts > 0 ? expertiseCosts : null,
      service_number: serviceNumber,
      complexity: mainProcess.occurrence_complexity,
      occurrence_status: mainProcess.occurrence_status,
      branch: mainProcess.branch,
      district: mainProcess.district,
      eligible_for_pilot: eligibleForPilot,
      is_event: isEvent,
      event_code: eventCode,
      participation_date: participationDate?.toISOString() ?? null,
      opening_date: openingDate?.toISOString().substring(0, 10) ?? null,
      acceptance_date: acceptanceDate?.toISOString().substring(0, 10) ?? null,
      closing_date: closingDate?.toISOString().substring(0, 10) ?? null,
      opening_year: openingWeek?.year ?? null,
      opening_week: openingWeek?.week ?? null,
      opening_week_label: openingWeek?.label ?? null,
      acceptance_year: acceptanceWeek?.year ?? null,
      acceptance_week: acceptanceWeek?.week ?? null,
      closing_year: closingWeek?.year ?? null,
      closing_week: closingWeek?.week ?? null,
      lt_opening_acceptance: ltOpeningAcceptance,
      lt_acceptance_closing: ltAcceptanceClosing,
      lt_total: ltTotal,
      source_upload_id_global: mainProcess.upload_id,
      source_upload_id_piloto: sourceUploadIdPiloto,
      source_upload_id_antigo: sourceUploadIdAntigo,
      updated_at: new Date().toISOString(),
    });
  }

  // Upsert in batches of 500
  const BATCH_SIZE = 500;
  let processed = 0;
  for (let i = 0; i < upsertBatch.length; i += BATCH_SIZE) {
    const batch = upsertBatch.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('occurrences')
      .upsert(batch, { onConflict: 'occurrence_id' });
    if (error) throw new Error(`Transform error: ${error.message}`);
    processed += batch.length;
  }

  return { processed };
}

export async function syncAgentsFromStaging() {
  const supabase = createServerClient();

  const { data: staged } = await supabase
    .from('staging_agentes')
    .select('agent_code, normalized_name, asf_aggregator, agent_full_name, wave, wave_start_date, tipology')
    .not('agent_code', 'is', null);

  if (!staged || staged.length === 0) return { synced: 0 };

  const agentRecords = staged
    .filter(s => s.agent_code)
    .map(s => {
      const waveMatch = s.wave?.match(/\d+/);
      return {
        agent_code: s.agent_code,
        normalized_name: s.normalized_name,
        asf_aggregator: s.asf_aggregator,
        agent_full_name: s.agent_full_name,
        wave_number: waveMatch ? parseInt(waveMatch[0]) : null,
        wave_name: s.wave,
        wave_start_date: s.wave_start_date,
        tipology: s.tipology,
        updated_at: new Date().toISOString(),
      };
    });

  const { error } = await supabase
    .from('agents')
    .upsert(agentRecords, { onConflict: 'agent_code' });

  if (error) throw new Error(`Agent sync error: ${error.message}`);
  return { synced: agentRecords.length };
}
