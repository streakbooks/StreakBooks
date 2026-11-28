import { describe, expect, it } from "vitest";
import { mapNonprofitStatement } from "./types";

describe("nonprofit fund statement", () => {
  it("keeps a management statement from being read as a filing", () => {
    const statement = mapNonprofitStatement({
      statutory_filing: false,
      government_approved: false,
      wording: "It is not a government filing.",
      period_from: "2026-11-01",
      as_of: "2026-11-01",
      funds: [
        {
          fund_id: "fund-1",
          code: "GEN",
          name: "General",
          restriction: "unrestricted",
          category: "general",
          status: "active",
          opening_net_assets_minor: 0,
          support_minor: "6000",
          expenses_minor: 180,
          transfers_minor: 0,
          releases_minor: 0,
          other_equity_minor: 0,
          closing_net_assets_minor: 5820,
          spendable_minor: 5820,
        },
      ],
      totals: { support_minor: 6000, expenses_minor: 180, closing_net_assets_minor: 5820 },
    });
    expect(statement.statutory_filing).toBe(false);
    expect(statement.government_approved).toBe(false);
    expect(statement.wording).toContain("not a government filing");
    expect(statement.funds[0]?.support_minor).toBe(6000);
    expect(statement.funds[0]?.closing_net_assets_minor).toBe(5820);
    expect(statement.totals.support_minor).toBe(6000);
    expect(statement.totals.opening_net_assets_minor).toBe(0);
  });

  it("does not invent a filing when the payload is empty", () => {
    const statement = mapNonprofitStatement(null);
    expect(statement.statutory_filing).toBe(false);
    expect(statement.government_approved).toBe(false);
    expect(statement.wording.toLowerCase()).toContain("not a government filing");
    expect(statement.funds).toEqual([]);
  });
});
