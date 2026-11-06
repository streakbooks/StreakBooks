/** Documented Advisors RPC auth surface for AD-10 release checks. */

export const ADVISORS_PUBLIC_RPCS = [
  "list_public_advisor_services",
  "advisors_start_conversation",
  "advisors_append_message",
  "advisors_capture_lead",
  "advisors_list_available_slots",
  "advisors_book_appointment",
  "advisors_get_appointment",
  "advisors_cancel_appointment",
  "advisors_reschedule_appointment",
  "advisors_get_proposal",
  "advisors_respond_proposal",
  "advisors_get_agreement",
  "advisors_accept_agreement",
] as const;

export const ADVISORS_PLATFORM_RPC_PREFIX = "platform_advisors_";

export const ADVISORS_PORTAL_RPC_PREFIX = "advisors_portal_";

export type AdvisorsAuthClass = "public" | "platform" | "portal" | "worker";

export function classifyAdvisorsRpc(name: string): AdvisorsAuthClass {
  if (ADVISORS_PUBLIC_RPCS.includes(name as (typeof ADVISORS_PUBLIC_RPCS)[number])) {
    return "public";
  }
  if (name.startsWith(ADVISORS_PLATFORM_RPC_PREFIX)) return "platform";
  if (name.startsWith(ADVISORS_PORTAL_RPC_PREFIX)) return "portal";
  if (name === "advisors_claim_due_reminders" || name === "advisors_mark_reminder_status") {
    return "worker";
  }
  if (name === "advisors_reclaim_stale_reminders") return "worker";
  return "platform";
}

/** Proposal/agreement acceptance must never be treated as paid billing start. */
export function acceptanceStartsPaidBilling(): false {
  return false;
}

export function requireCheckoutIdForAttach(checkoutId: string | null | undefined): string {
  if (!checkoutId) {
    throw new Error("Checkout id is required to attach an Advisors subscription checkout.");
  }
  return checkoutId;
}
