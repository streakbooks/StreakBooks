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
  it("rejects unknown navigation and invalid dates without executing or retaining arbitrary URL state", () => {
    expect(
      parseReportingCentreSearch({
        tab: "arbitrary",
        from: "2026-02-30",
        to: "invalid",
        sql: "ignored",
      }),
    ).toEqual({ tab: "home" });
  });
});
