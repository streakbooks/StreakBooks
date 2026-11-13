import { describe, expect, it } from "vitest";
import {
  DASHBOARD_ATTENTION_FILTERS,
  parseDashboardSearch,
} from "./attention-navigation";

describe("Dashboard priority queue deep links", () => {
  it("accepts every supported queue filter", () => {
    for (const attention of DASHBOARD_ATTENTION_FILTERS) {
      expect(parseDashboardSearch({ attention })).toEqual({ attention });
    }
  });

  it("restores a queue filter from the browser URL", () => {
    const params = new URLSearchParams("attention=overdue");
    expect(parseDashboardSearch(Object.fromEntries(params))).toEqual({
      attention: "overdue",
    });
  });

  it("rejects unknown, external and malformed destinations", () => {
    expect(parseDashboardSearch({
      attention: "../accounting",
      redirect: "https://evil.example",
    })).toEqual({});
    expect(parseDashboardSearch({ attention: "/sales/invoices" })).toEqual({});
    expect(parseDashboardSearch({ attention: ["bank"] })).toEqual({});
  });

  it("ignores unrelated query parameters or privileged selectors", () => {
    expect(parseDashboardSearch({ attention: "bank", companyId: "other-company" }))
      .toEqual({ attention: "bank" });
  });

  it("resolves missing filters to the default dashboard state", () => {
    expect(parseDashboardSearch({})).toEqual({});
    expect(parseDashboardSearch({ attention: "" })).toEqual({});
    expect(parseDashboardSearch({ attention: null })).toEqual({});
  });
});
