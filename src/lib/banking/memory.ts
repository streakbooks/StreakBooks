import type { CodingHistoryRow } from "./suggestions";

export type MemoryPreference = CodingHistoryRow & {
  history_id: string;
  enabled: boolean;
  last_approved_at: string;
  latest_journal_id: string;
  last_feedback?: { state: MemoryFeedbackState; posted: boolean; created_at: string } | null;
};
export type MemoryFeedbackState = "accepted" | "edited" | "rejected";
