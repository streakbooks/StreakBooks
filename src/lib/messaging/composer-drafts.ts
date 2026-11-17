const PREFIX = "linkbooks.messaging.draft:";

export function messagingDraftKey(companyId: string, conversationId: string): string {
  return `${PREFIX}${companyId}:${conversationId}`;
}

export function loadMessagingComposerDraft(
  companyId: string | null,
  conversationId: string | null,
): string {
  if (!companyId || !conversationId || typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(messagingDraftKey(companyId, conversationId)) ?? "";
  } catch {
    return "";
  }
}

export function saveMessagingComposerDraft(
  companyId: string | null,
  conversationId: string | null,
  body: string,
): void {
  if (!companyId || !conversationId || typeof localStorage === "undefined") return;
  try {
    const key = messagingDraftKey(companyId, conversationId);
    const trimmed = body.trim();
    if (!trimmed) localStorage.removeItem(key);
    else localStorage.setItem(key, body.slice(0, 8000));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function clearMessagingComposerDraft(
  companyId: string | null,
  conversationId: string | null,
): void {
  if (!companyId || !conversationId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(messagingDraftKey(companyId, conversationId));
  } catch {
    // ignore
  }
}
