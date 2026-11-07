import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearOfflineExpenseClaimDrafts,
  enqueueOfflineExpenseClaimDraft,
  isBrowserOffline,
  listOfflineExpenseClaimDrafts,
  removeOfflineExpenseClaimDraft,
} from "./offline-claim-queue";

describe("offline expense claim queue", () => {
  afterEach(() => {
    clearOfflineExpenseClaimDrafts("company-1");
    vi.unstubAllGlobals();
  });

  it("stores and removes drafts per company", () => {
    const saved = enqueueOfflineExpenseClaimDraft("company-1", {
      title: "Taxi",
      claimDate: "2026-11-07",
      claimCurrency: "USD",
      lines: [
        {
          expenseDate: "2026-11-07",
          description: "Airport taxi",
          accountId: "11111111-1111-1111-1111-111111111111",
          netMinor: 2000,
          taxMinor: 0,
          grossMinor: 2000,
        },
      ],
    });
    expect(listOfflineExpenseClaimDrafts("company-1")).toHaveLength(1);
    expect(listOfflineExpenseClaimDrafts("company-1")[0]?.draft.title).toBe("Taxi");
    expect(listOfflineExpenseClaimDrafts("company-2")).toHaveLength(0);
    removeOfflineExpenseClaimDraft("company-1", saved.id);
    expect(listOfflineExpenseClaimDrafts("company-1")).toHaveLength(0);
  });

  it("detects browser offline state", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isBrowserOffline()).toBe(true);
    vi.stubGlobal("navigator", { onLine: true });
    expect(isBrowserOffline()).toBe(false);
  });
});
