/**
 * Optional AI messaging assistance (Phase 7).
 * Permission-aware and opt-in. Never posts, pays, approves or sends externally without confirmation.
 */
export type MessagingAiCapability =
  | "summarize_conversation"
  | "summarize_thread"
  | "suggest_reply"
  | "improve_writing"
  | "translate"
  | "extract_action_items"
  | "draft_document_request"
  | "search_assist"
  | "suggest_record_refs"
  | "unresolved_summary"
  | "suggest_escalation";

export type MessagingAiRequest = {
  companyId: string;
  conversationId: string;
  capability: MessagingAiCapability;
  /** Caller-authorised message excerpts only — never cross-tenant. */
  authorisedContext: string[];
  userConfirmedExternalSend?: boolean;
};

export type MessagingAiResult = {
  ok: false;
  reason: string;
};

/**
 * Fail-closed stub until a provider is configured and the org enables allow_ai_assist.
 * Always refuses autonomous accounting or external sends.
 */
export function runMessagingAiAssist(request: MessagingAiRequest): MessagingAiResult {
  if (!request.authorisedContext.length) {
    return { ok: false, reason: "No authorised context supplied" };
  }
  if (request.userConfirmedExternalSend) {
    return {
      ok: false,
      reason: "External AI sends require a configured provider and explicit product confirmation flow",
    };
  }
  return {
    ok: false,
    reason:
      "AI messaging assist is not connected. Enable messaging AI in settings after provider configuration.",
  };
}

export function messagingAiDisclosure(): string {
  return "LinkBooks AI suggestions are optional and may be wrong. They cannot approve payments, post journals or send external replies without your confirmation.";
}
