import { describe, expect, it } from "vitest";
import { applyOrganisationReportDefaults } from "./report-defaults";

describe("Settings Centre Reports default basis", () => {
  it("uses the saved organisation cash basis when no report override exists", () => {
    expect(
      applyOrganisationReportDefaults({ from: "2026-01-01" }, { default_basis: "cash" }),
    ).toEqual({ from: "2026-01-01", basis: "cash" });
  });

  it("preserves the report's explicitly selected cash or accrual basis", () => {
    expect(
      applyOrganisationReportDefaults({ basis: "accrual" }, { default_basis: "cash" }),
    ).toEqual({ basis: "accrual" });
    expect(
      applyOrganisationReportDefaults({ basis: "cash" }, { default_basis: "accrual" }),
    ).toEqual({ basis: "cash" });
  });

  it("preserves explicitly customized report settings", () => {
    const saved = { settings: '{"basis":"cash"}', from: "2026-01-01" };
    expect(applyOrganisationReportDefaults(saved, { default_basis: "accrual" })).toEqual(saved);
  });

  it("uses accrual safely for missing or malformed defaults", () => {
    expect(applyOrganisationReportDefaults({}, null)).toEqual({ basis: "accrual" });
    expect(applyOrganisationReportDefaults({}, { default_basis: "unknown" })).toEqual({
      basis: "accrual",
    });
  });
});
