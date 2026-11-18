/** URL search state is navigation only; AI permissions and posting require server verification. */
export const AI_SUGGESTION_STATUSES = [
  "all", "validated", "pending", "invalid", "rejected", "applied",
] as const;
export type AiSuggestionStatus = (typeof AI_SUGGESTION_STATUSES)[number];

export type AiAssistantSearch = {
  reviewCase?: string;
  suggestionStatus?: AiSuggestionStatus;
  suggestionQ?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAiAssistantSearch(raw: Record<string, unknown>): AiAssistantSearch {
  const result: AiAssistantSearch = {};
  const caseId = raw["reviewCase"];
  if (typeof caseId === "string" && UUID.test(caseId)) result.reviewCase = caseId;

  const status = raw["suggestionStatus"];
  if (
    typeof status === "string" &&
    (AI_SUGGESTION_STATUSES as readonly string[]).includes(status)
  ) result.suggestionStatus = status as AiSuggestionStatus;

  const q = raw["suggestionQ"];
  if (typeof q === "string" && q.length > 0 && q.length <= 100) result.suggestionQ = q;
  return result;
}
