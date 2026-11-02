import { describe, expect, it } from "vitest";
import { parseReportingCentreSearch, REPORTING_TABS } from "./centre-search";
describe("reporting centre navigation", () => {
  it.each(REPORTING_TABS)("retains supported tab %s and real report dates", (tab) => {
    expect(parseReportingCentreSearch({ tab, from: "2026-04-01", to: "2026-11-02" })).toEqual({
      tab,
      from: "2026-04-01",
      to: "2026-11-02",
    });
  });
  it("preserves independently openable report-pack URLs but rejects malformed IDs", () => {
    const pack = "deafcafe-1111-4111-8111-aabc12345678";
    expect(parseReportingCentreSearch({ tab: "packs", pack, from: "2026-10-01" })).toEqual({
      tab: "packs",
      pack,
      from: "2026-10-01",
    });
    expect(parseReportingCentreSearch({ tab: "packs", pack: "../not-a-pack" })).toEqual({
      tab: "packs",
    });
    expect(parseReportingCentreSearch({ tab: "published", pack: ["not", "a", "uuid"] })).toEqual({
      tab: "published",
    });
  });
  it("rejects unknown navigation and invalid dates without executing or retaining arbitrary URL state", () => {
    expect(
      parseReportingCentreSearch({
        tab: "arbitrary",
        from: "2026-02-30",
        to: "invalid",
        sql: "ignored",
      }),
    ).toEqual({ tab: "standard" });
  });
});
