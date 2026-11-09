/**
 * Formal CRM acceptance pack (contract level).
 * Live browser/DB proof remains separate; these gates document and unit-test required outcomes.
 */

export type CrmE2eCaseId =
  | "lead-create-persists"
  | "lead-assign-member"
  | "opportunity-stage-move"
  | "lead-convert-match"
  | "unauthorized-denied";

export type CrmE2eCase = {
  id: CrmE2eCaseId;
  title: string;
  required: string;
  automatedContract: string;
};

export const CRM_E2E_CASES: readonly CrmE2eCase[] = [
  {
    id: "lead-create-persists",
    title: "Create lead persists",
    required: "upsert_crm_lead returns id + leadNumber; list shows the lead after refresh",
    automatedContract: "Lead draft validation rejects empty identity; mapper round-trips number",
  },
  {
    id: "lead-assign-member",
    title: "Assign lead to org member",
    required: "assign_crm_lead rejects non-members; accepted assign sets ownerUserId",
    automatedContract: "Team workload counts owners; territory rules remain fail-closed",
  },
  {
    id: "opportunity-stage-move",
    title: "Opportunity stage change",
    required: "set_crm_opportunity_stage updates stage with optional expected_version",
    automatedContract: "Forecast weighting uses stage probability for open deals only",
  },
  {
    id: "lead-convert-match",
    title: "Convert without duplicate contact when match linked",
    required: "convert_crm_lead uses selected contactId when matches exist",
    automatedContract: "Account overlay / convert match path covered by CRM mappers + gap RPCs",
  },
  {
    id: "unauthorized-denied",
    title: "Unauthorized denied",
    required: "Missing crm.* permission fails closed on server fns and RLS",
    automatedContract: "Comms/automation/import policies default to cannot-send/run/import",
  },
] as const;

export function crmE2eCaseIds(): CrmE2eCaseId[] {
  return CRM_E2E_CASES.map((c) => c.id);
}

export function assertCrmE2ePackComplete(ids: readonly string[]): string | null {
  const missing = CRM_E2E_CASES.filter((c) => !ids.includes(c.id)).map((c) => c.id);
  if (missing.length) return `Missing E2E cases: ${missing.join(", ")}`;
  return null;
}
