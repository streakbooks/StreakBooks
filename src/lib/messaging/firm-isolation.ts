/**
 * Firm / accountant multi-client isolation helpers.
 * Conversations must never be shared across client company contexts.
 */

export type FirmConversationContext = {
  firmUserId: string;
  clientCompanyId: string;
  conversationCompanyId: string;
  membershipCompanyId: string;
};

export function assertFirmClientConversationIsolation(
  context: FirmConversationContext,
): { ok: true } | { ok: false; reason: string } {
  if (!context.firmUserId) {
    return { ok: false, reason: "Missing firm user" };
  }
  if (context.clientCompanyId !== context.conversationCompanyId) {
    return {
      ok: false,
      reason: "Conversation company does not match selected client company",
    };
  }
  if (context.membershipCompanyId !== context.clientCompanyId) {
    return {
      ok: false,
      reason: "Membership company does not match selected client company",
    };
  }
  return { ok: true };
}
