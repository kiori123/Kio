export type CoverageStatus = "missing" | "partial" | "confirmed";
export type QuestionOrigin = "bank" | "adapted" | "generated" | "followup";
export type SuggestionStatus = "pending" | "asked" | "answered" | "skipped" | "stale";
export type Phase = "open" | "discover" | "deep" | "close";
export type Speaker = "host" | "brand" | "unknown";

export interface BankQuestion {
  id: string;
  code: string;
  text_en: string;
  text_vi: string | null;
  field_ids: string[];
  section_id: string;
  phase: Phase;
  priority: number;
  ask_when: string | null;
  is_active: boolean;
}

export interface Meeting {
  id: string;
  workspace_id: string;
  brand_name: string;
  title: string | null;
  language: "auto" | "vi" | "en";
  prep_notes: string | null;
  status: "scheduled" | "live" | "ended";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  seq: number;
  speaker: Speaker;
  text: string;
  started_ms: number | null;
  ended_ms: number | null;
  created_at: string;
}

export interface Evidence {
  quote: string;
  seq?: number;
}

export interface FieldCoverage {
  meeting_id: string;
  field_id: string;
  status: CoverageStatus;
  confidence: number;
  value: string | null;
  evidence: Evidence[];
  updated_at: string;
}

export interface QuestionSuggestion {
  id: string;
  meeting_id: string;
  bank_question_id: string | null;
  field_ids: string[];
  text: string;
  rationale: string | null;
  urgency: number;
  origin: QuestionOrigin;
  status: SuggestionStatus;
  batch_seq: number;
  created_at: string;
}

export interface OnePagerRecord {
  id: string;
  meeting_id: string;
  version: number;
  content: OnePagerContent;
  markdown: string;
  generated_at: string;
}

export interface OnePagerContent {
  headline: string;
  sections: {
    id: string;
    title: string;
    fields: { id: string; label: string; value: string; status: CoverageStatus }[];
  }[];
  gaps: string[];
  recommended_next_steps: string[];
}
