import { describe, expect, it } from "vitest";
import {
  applyOrganisationReportDefaults,
  reportQueryUsesAccountingDefaults,
} from "./report-defaults";

describe("Settings Centre Reports default basis", () => {
  it("uses the saved organisation cash basis when no report override exists", () => {
    expect(
      applyOrganisationReportDefaults({ from: "2026-01-01" }, { default_basis: "accrual" }, "cash"),
    ).toEqual({ from: "2026-01-01", basis: "cash" });
  });

  it("preserves the report's explicitly selected cash or accrual basis", () => {
    expect(applyOrganisationReportDefaults({ basis: "accrual" }, null, "cash")).toEqual({
      basis: "accrual",
    });
    expect(
      applyOrganisationReportDefaults({ basis: "cash" }, { default_basis: "accrual" }),
    ).toEqual({ basis: "cash" });
  });

  it("preserves explicitly customized report settings", () => {
    const saved = { settings: '{"basis":"cash"}', from: "2026-01-01" };
    expect(applyOrganisationReportDefaults(saved, { default_basis: "accrual" })).toEqual(saved);
  });

  it("uses accrual when Accounting has no preference, regardless of legacy Reports basis", () => {
    expect(applyOrganisationReportDefaults({}, null)).toEqual({ basis: "accrual" });
    expect(applyOrganisationReportDefaults({}, { default_basis: "cash" })).toEqual({
      basis: "accrual",
    });
  });
  it("applies the saved comparison to statements without report-specific options", () => {
    expect(
      applyOrganisationReportDefaults(
        {},
        { default_basis: "accrual", default_comparison: "prior_period" },
        "cash",
      ),
    ).toEqual({ basis: "cash", columns: "prior_period" });
    expect(applyOrganisationReportDefaults({}, { default_comparison: "prior_year" })).toEqual({
      basis: "accrual",
      columns: "prior_year",
    });
  });

  it("respects an explicit basis while still applying an unset comparison default", () => {
    expect(
      applyOrganisationReportDefaults(
        { basis: "accrual" },
        { default_basis: "cash", default_comparison: "prior_year" },
      ),
    ).toEqual({ basis: "accrual", columns: "prior_year" });
  });

  it("never replaces explicit column or comparison choices", () => {
    expect(
      applyOrganisationReportDefaults({ columns: "month" }, { default_comparison: "prior_year" }),
    ).toEqual({ basis: "accrual", columns: "month" });
    expect(
      applyOrganisationReportDefaults(
        { compare: "months" },
        { default_comparison: "prior_period" },
      ),
    ).toEqual({ basis: "accrual", compare: "months" });
  });
});

it("refreshes the edited company reports and firm aggregates when Accounting defaults change", () => {
  expect(reportQueryUsesAccountingDefaults(["reporting-basis", "a"], "a")).toBe(true);
  expect(reportQueryUsesAccountingDefaults(["standard-statement", "b"], "a")).toBe(false);
  expect(reportQueryUsesAccountingDefaults(["firm-reporting", "firm"], "a")).toBe(true);
  expect(reportQueryUsesAccountingDefaults(["invoice", "a"], "a")).toBe(false);
});
