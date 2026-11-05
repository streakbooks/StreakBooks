import { describe, expect, it, vi } from "vitest";
import { parseAccountingBasis, savedReportBasis, withSavedReportBasis } from "./accounting-basis";
import { resolveReportingBasis } from "./accounting-basis.server";
import type { Sb } from "@/lib/accounting/ledger-data";

function settings(document: unknown = { reporting_basis: "cash" }, error: unknown = null) {
  const eq = vi.fn();
  const query = {
    select: () => query,
    eq,
    maybeSingle: async () => ({ data: { document }, error }),
  };
  eq.mockReturnValue(query);
  const from = vi.fn(() => query);
  return { sb: { from } as unknown as Sb, from, eq };
}
describe("existing company accounting basis", () => {
  it("resolves the tenant-scoped persisted accounting setting", async () => {
    const db = settings();
    expect(await resolveReportingBasis(db.sb, "company-a")).toBe("cash");
    expect(db.from).toHaveBeenCalledWith("organisation_config");
    expect(db.eq.mock.calls).toEqual([
      ["company_id", "company-a"],
      ["category", "accounting"],
    ]);
  });
  it("preserves explicit accrual overrides and avoids loading another default", async () => {
    const db = settings();
    expect(await resolveReportingBasis(db.sb, "company-a", "accrual")).toBe("accrual");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("retains accrual for a company with no existing preference", async () => {
    expect(await resolveReportingBasis(settings({}).sb, "company-a")).toBe("accrual");
  });
  it("does not silently fall back after an invalid selection or failed settings read", async () => {
    expect(() => parseAccountingBasis("modified_cash")).toThrow("Choose cash or accrual");
    await expect(
      resolveReportingBasis(settings({}, { message: "Denied" }).sb, "company-a"),
    ).rejects.toThrow("Denied");
  });
});

describe("saved report basis before capture", () => {
  it("preserves explicit builder and standard search overrides", () => {
    expect(savedReportBasis({ basis: "cash", _builder: { basis: "accrual" } })).toBe("accrual");
    expect(savedReportBasis({ basis: "accrual", settings: '{"basis":"cash"}' })).toBe("accrual");
    expect(savedReportBasis({ settings: '{"basis":"cash"}' })).toBe("cash");
    expect(savedReportBasis({ _builder: { title: "Legacy" }, settings: "{}" })).toBeUndefined();
  });

  it("freezes the company default in a new definition without mutating the saved view", () => {
    const config = { _builder: { title: "Legacy" }, settings: '{"group":"month"}' };
    expect(withSavedReportBasis(config, "cash")).toEqual({
      basis: "cash",
      _builder: { title: "Legacy", basis: "cash" },
      settings: '{"group":"month","basis":"cash"}',
    });
    expect(config).toEqual({ _builder: { title: "Legacy" }, settings: '{"group":"month"}' });
  });

  it("does not replace saved explicit accrual with the company cash default", () => {
    expect(
      withSavedReportBasis({ basis: "accrual", settings: '{"basis":"cash"}' }, "cash"),
    ).toEqual({ basis: "accrual", settings: '{"basis":"accrual"}' });
  });
});
