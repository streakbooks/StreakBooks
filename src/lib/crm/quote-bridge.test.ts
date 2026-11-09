import { describe, expect, it } from "vitest";
import { buildOpportunityQuoteLine } from "@/lib/crm/quote-bridge";

describe("buildOpportunityQuoteLine", () => {
  it("builds a single sales line from the opportunity amount", () => {
    const line = buildOpportunityQuoteLine({
      opportunityName: "Acme rollout",
      opportunityNumber: "OPP-0001",
      amountMinor: 125000,
      accountId: "11111111-1111-1111-1111-111111111111",
    });
    expect(line.quantity).toBe(1);
    expect(line.unitPriceMinor).toBe(125000);
    expect(line.description).toContain("OPP-0001");
    expect(line.accountId).toBe("11111111-1111-1111-1111-111111111111");
  });
});
