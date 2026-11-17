import { describe, expect, it } from "vitest";
import { getMessagingRecordAdapter, MESSAGING_RECORD_ADAPTERS } from "./module-adapters";

describe("messaging module adapters", () => {
  it("registers core record types", () => {
    expect(getMessagingRecordAdapter("sales_invoice")?.allowExternal).toBe(true);
    expect(getMessagingRecordAdapter("sales_quote")?.buildDeepLink("abc")).toBe(
      "/sales/quotes/abc",
    );
    expect(getMessagingRecordAdapter("sales_credit_note")?.buildDeepLink("abc")).toBe(
      "/sales/credit-notes/abc",
    );
    expect(getMessagingRecordAdapter("expense_claim")?.allowExternal).toBe(false);
    expect(getMessagingRecordAdapter("hr_leave_request")?.defaultVisibility).toBe("hr_private");
    expect(getMessagingRecordAdapter("advisor_engagement")?.defaultVisibility).toBe("advisor");
  });

  it("builds deep links without leaking other tenants", () => {
    for (const adapter of MESSAGING_RECORD_ADAPTERS) {
      const link = adapter.buildDeepLink("00000000-0000-4000-8000-000000000001");
      expect(link.startsWith("/")).toBe(true);
      expect(link).toContain("00000000-0000-4000-8000-000000000001");
    }
  });
});
