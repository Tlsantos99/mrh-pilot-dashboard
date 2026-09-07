export type FileType = 'global' | 'piloto' | 'antigo' | 'agentes' | 'chamadas';
export type UploadStatus = 'processing' | 'success' | 'partial' | 'error' | 'duplicate';

export interface UploadHistory {
  id: string;
  filename: string;
  file_type: FileType;
  file_hash: string;
  upload_timestamp: string;
  uploaded_by?: string;
  rows_received: number;
  rows_inserted: number;
  rows_updated: number;
  rows_rejected: number;
  status: UploadStatus;
  error_message?: string;
}

export interface ValidationResult {
  fileType: FileType | null;
  detected: boolean;
  filename: string;
  rowsFound: number;
  rowsNew: number;
  rowsDuplicate: number;
  errors: string[];
  warnings: string[];
  ready: boolean;
  fileHash: string;
  isDuplicateFile: boolean;
}

export interface Occurrence {
  occurrence_id: string;
  main_process_id?: string;
  agent_code?: string;
  agent_name?: string;
  wave_number?: number;
  wave_name?: string;
  channel?: 'Formulário Novo' | 'Formulário Antigo' | 'Email/Outro';
  has_expertise: boolean;
  expertise_costs?: number;
  complexity?: string;
  occurrence_status?: string;
  eligible_for_pilot: boolean;
  is_event: boolean;
  opening_date?: string;
  acceptance_date?: string;
  closing_date?: string;
  opening_week?: number;
  opening_week_label?: string;
  lt_opening_acceptance?: number;
  lt_acceptance_closing?: number;
  lt_total?: number;
}

export interface AdoptionWeekly {
  year: number;
  week: number;
  week_label: string;
  week_start?: string;
  novo: number;
  antigo: number;
  email_outro: number;
  total: number;
  adoption_rate: number;
}

export interface GDWeekly {
  year: number;
  week: number;
  week_label: string;
  channel: string;
  total: number;
  gd_count: number;
  expertise_count: number;
  gd_rate: number;
}

export interface LeadTimeWeekly {
  year: number;
  week: number;
  week_label: string;
  channel: string;
  expertise_type: string;
  total: number;
  avg_lt_opening_acceptance: number;
  avg_lt_acceptance_closing: number;
  avg_lt_total: number;
}

export interface AgentPerformance {
  agent_code: string;
  agent_name?: string;
  wave_number?: number;
  wave_name?: string;
  total: number;
  novo: number;
  antigo: number;
  email_outro: number;
  adoption_rate?: number;
  gd_rate?: number;
  avg_lt_total?: number;
}

export interface CallCenterWeekly {
  year: number;
  week: number;
  week_label: string;
  total_calls: number;
  within_hours: number;
  outside_hours: number;
  answered: number;
  abandoned: number;
  answer_rate_within_hours: number;
  avg_duration_minutes: number;
}

export interface SummaryKPIs {
  total_eligible: number;
  total_novo: number;
  total_antigo: number;
  total_email: number;
  adoption_rate: number;
  gd_rate_global: number;
  gd_rate_novo: number;
  gd_rate_antigo: number;
  avg_lt_total: number;
  avg_lt_gd: number;
  avg_lt_expertise: number;
  avg_lt_opening_acceptance: number;
}

export interface DataQualityIssue {
  issue: string;
  count: number;
}

export interface PendingOccurrence {
  occurrence_id: string;
  agent_name?: string;
  channel?: string;
  wave_name?: string;
  opening_date?: string;
  days_waiting?: number;
}

export interface DashboardFilters {
  waves: number[];
  channels: string[];
  hasExpertise: string;
  weekRange: [number, number] | null;
}
