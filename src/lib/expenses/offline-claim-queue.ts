import type { ExpenseClaimDraftInput } from "@/lib/expenses/claims";

const STORAGE_PREFIX = "streakbooks.expense-offline-drafts.";

/** In-memory fallback when localStorage is unavailable (SSR / some test runners). */
const memoryStore = new Map<string, OfflineExpenseClaimDraft[]>();

export type OfflineExpenseClaimDraft = {
  id: string;
  savedAt: string;
  draft: ExpenseClaimDraftInput;
};

function storageKey(companyId: string): string {
  return `${STORAGE_PREFIX}${companyId}`;
}

function readRaw(companyId: string): OfflineExpenseClaimDraft[] {
  const key = storageKey(companyId);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is OfflineExpenseClaimDraft =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as OfflineExpenseClaimDraft).id === "string" &&
          typeof (item as OfflineExpenseClaimDraft).savedAt === "string" &&
          Boolean((item as OfflineExpenseClaimDraft).draft),
      );
    }
  } catch {
    /* fall through to memory */
  }
  return memoryStore.get(key) ?? [];
}

function writeRaw(companyId: string, items: OfflineExpenseClaimDraft[]): void {
  const key = storageKey(companyId);
  memoryStore.set(key, items);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(items));
    }
  } catch {
    /* memory store remains authoritative */
  }
}

export function listOfflineExpenseClaimDrafts(companyId: string): OfflineExpenseClaimDraft[] {
  return readRaw(companyId);
}

export function enqueueOfflineExpenseClaimDraft(
  companyId: string,
  draft: ExpenseClaimDraftInput,
): OfflineExpenseClaimDraft {
  const { id: _omitId, version: _omitVersion, ...draftWithoutIds } = draft;
  const item: OfflineExpenseClaimDraft = {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    // Server assigns claim id on sync; keep local-only drafts free of stale ids.
    draft: draftWithoutIds,
  };
  const next = [item, ...readRaw(companyId)];
  writeRaw(companyId, next);
  return item;
}

export function removeOfflineExpenseClaimDraft(companyId: string, draftId: string): void {
  writeRaw(
    companyId,
    readRaw(companyId).filter((item) => item.id !== draftId),
  );
}

export function clearOfflineExpenseClaimDrafts(companyId: string): void {
  const key = storageKey(companyId);
  memoryStore.delete(key);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
