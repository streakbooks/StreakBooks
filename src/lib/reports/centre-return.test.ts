import { describe, expect, it } from "vitest";
import {
  decodeReportingCentreContext,
  encodeReportingCentreContext,
  normalizeReportingCentreContext,
  reportingCentreBackSearch,
} from "./centre-return";

describe("Reports Centre return-to-origin navigation", () => {
  it("round-trips a filtered catalogue and its reporting period", () => {
    const context = {
      tab: "standard", query: "aged & overdue", category: "sales",
      from: "2026-01-01", to: "2026-10-31",
    };
    expect(decodeReportingCentreContext(encodeReportingCentreContext(context))).toEqual(context);
  });

  it("round-trips management, custom and workflow tab views", () => {
    for (const tab of ["home", "custom", "management", "adviser", "drafts", "published", "templates"]) {
      expect(decodeReportingCentreContext(encodeReportingCentreContext({ tab }))).toEqual({ tab });
    }
  });

  it("preserves authorized pack identifiers, not arbitrary URLs", () => {
    const pack = "deafcafe-1111-4111-8111-aabc12345678";
    expect(decodeReportingCentreContext(encodeReportingCentreContext({
      tab: "packs", pack,
    }))).toEqual({ tab: "packs", pack });
  });

  it("omits arbitrary parameters and never produces a redirect", () => {
    expect(decodeReportingCentreContext(
      "tab=standard&returnTo=https%3A%2F%2Fexample.com&sql=ignored",
    )).toEqual({ tab: "standard" });
    expect(normalizeReportingCentreContext(
      "tab=standard&returnTo=https%3A%2F%2Fexample.com",
    )).toBe("tab=standard");
  });

  it("returns null for empty or invalid origin context", () => {
    expect(decodeReportingCentreContext(null)).toBeNull();
    expect(decodeReportingCentreContext(undefined)).toBeNull();
    expect(decodeReportingCentreContext({ tab: "standard" })).toBeNull();
    expect(decodeReportingCentreContext("")).toBeNull();
    expect(decodeReportingCentreContext("returnTo=%2Freports")).toBeNull();
    expect(decodeReportingCentreContext("tab=")).toBeNull();
  });

  it("enforces the context size bound", () => {
    expect(decodeReportingCentreContext("tab=standard&q=" + "x".repeat(2200))).toBeNull();
    expect(encodeReportingCentreContext({
      tab: "standard", query: "x".repeat(2400),
    }).length).toBeLessThanOrEqual(2048);
  });

  it("uses original period and tab when returning from a modified report", () => {
    const token = encodeReportingCentreContext({
      tab: "standard", query: "tax", category: "tax",
      from: "2026-01-01", to: "2026-08-31",
    });
    expect(reportingCentreBackSearch(token, "2026-04-01", "2026-11-01")).toEqual({
      tab: "standard", query: "tax", category: "tax",
      from: "2026-01-01", to: "2026-08-31",
    });
  });

  it("provides deterministic navigation on direct report deep links", () => {
    expect(reportingCentreBackSearch(undefined, "2026-01-01", "2026-11-01")).toEqual({
      tab: "standard", from: "2026-01-01", to: "2026-11-01",
    });
  });

  it("drops unsupported category and invalid date values", () => {
    const result = decodeReportingCentreContext(
      "tab=standard&category=untrusted&from=yesterday&to=2026-02-30",
    );
    expect(result).toEqual({ tab: "standard" });
  });
});
