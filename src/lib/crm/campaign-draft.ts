/** Pure campaign draft validation (no I/O). */

export type CrmCampaignStatus = "planned" | "active" | "paused" | "completed" | "cancelled";

export const CRM_CAMPAIGN_STATUSES: readonly CrmCampaignStatus[] = [
  "planned",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;

export type CrmCampaignDraft = {
  name: string;
  status: CrmCampaignStatus;
  budgetMinor: number;
  currencyCode: string;
  startsOn?: string | null;
  endsOn?: string | null;
};

export function validateCrmCampaignDraft(draft: CrmCampaignDraft): string | null {
  const name = draft.name.trim();
  if (!name || name.length > 160) return "Campaign name is required (1-160 characters)";
  if (!CRM_CAMPAIGN_STATUSES.includes(draft.status)) return "Invalid campaign status";
  if (draft.budgetMinor < 0) return "Budget must be zero or greater";
  const currency = draft.currencyCode.trim().toUpperCase();
  if (currency.length !== 3) return "Currency must be a 3-letter code";
  if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn) {
    return "End date must be on or after start date";
  }
  return null;
}
