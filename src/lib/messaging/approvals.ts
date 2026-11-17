/**
 * Formal approval handoff from messaging context.
 * Chat text, reactions or the word "approved" never authorise ledger changes.
 * Callers must invoke the authoritative module approval engine after permission checks.
 */
export type MessagingApprovalRequestKind =
  | "invoice_review"
  | "bill_approval"
  | "expense_claim_approval"
  | "journal_review"
  | "reconciliation_clarification"
  | "document_verification"
  | "purchase_order_approval"
  | "task_assignment"
  | "escalation";

export type MessagingApprovalHandoff = {
  kind: MessagingApprovalRequestKind;
  companyId: string;
  conversationId: string;
  recordType: string;
  recordId: string;
  assigneeUserId: string;
  note: string;
};

export function buildMessagingApprovalEventKey(handOff: MessagingApprovalHandoff): string {
  return [
    "messaging-approval",
    handOff.kind,
    handOff.conversationId,
    handOff.recordId,
    handOff.assigneeUserId,
  ].join(":");
}

export function messagingApprovalTargetPath(handOff: MessagingApprovalHandoff): string {
  return `/messages?conversation=${handOff.conversationId}&filter=transactions`;
}

/** UI/copy guard — never treat free text as an approval decision. */
export function looksLikeInformalApproval(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /^(approved|approve|lgtm|ok|okay|looks good)[.!]*$/.test(normalized);
}
