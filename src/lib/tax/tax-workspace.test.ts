import { describe, expect, it } from "vitest";
import { summarizeTaxWorkspace } from "./tax-workspace";

const base = {
  regime: "vat",
  registrationNumber: "GB123",
  filingFrequency: "quarterly",
  rates: [{ is_active: true }, { is_active: false }],
  codes: [{ is_active: true }],
  returns: [{ status: "filed" }, { status: "draft" }],
  returnsAvailable: true,
};

describe("Tax workspace setup indicators", () => {
  it("counts active configurations and saved return statuses", () => {
    expect(summarizeTaxWorkspace(base)).toMatchObject({
      activeRates: 1,
      totalRates: 2,
      activeCodes: 1,
      draftReturns: 1,
      filedReturns: 1,
    });
  });

  it("does not incorrectly require a tax number where no regime is selected", () => {
    const summary = summarizeTaxWorkspace({
      ...base,
      regime: "none",
      registrationNumber: null,
      filingFrequency: null,
      rates: [],
      codes: [],
    });
    expect(summary.tasks).toHaveLength(2);
    expect(summary.tasks[0]).toMatch(/tax regime/);
    expect(summary.tasks[1]).toMatch(/draft returns/);
  });

  it("shows specific setup and migration warnings, never claims compliance", () => {
    const summary = summarizeTaxWorkspace({
      ...base,
      registrationNumber: null,
      filingFrequency: null,
      rates: [],
      codes: [],
      returns: [],
      returnsAvailable: false,
    });
    expect(summary.tasks).toEqual([
      expect.stringContaining("registration number"),
      expect.stringContaining("return frequency"),
      expect.stringContaining("tax rate"),
      expect.stringContaining("tax codes"),
      expect.stringContaining("database migration"),
    ]);
  });

  it("keeps the no-action state informational, not a filing certification", () => {
    const summary = summarizeTaxWorkspace({ ...base, returns: [] });
    expect(summary.tasks).toEqual([]);
  });
});
