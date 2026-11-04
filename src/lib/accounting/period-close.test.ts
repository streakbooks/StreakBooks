import { describe, expect, it } from "vitest";
import {
  assertPeriodCloseReview,
  buildCloseChecklist,
  summariseChecklist,
  type CloseFacts,
} from "./period-close";

const clean: CloseFacts = {
  periodEnd: "2026-12-31",
  unreconciledBankLines: 0,
  draftDocuments: 0,
  ar: { found: true, variance: 0 },
  ap: { found: true, variance: 0 },
  openingBalanceMinor: 0,
  taxReturn: { applicable: true, filed: true },
  yearEnd: { closed: true },
};

const status = (f: CloseFacts, id: string) =>
  buildCloseChecklist(f).find((c) => c.id === id)?.status;

describe("period close checklist", () => {
  it("is clean when everything agrees", () => {
    const s = summariseChecklist(buildCloseChecklist(clean));
    expect(s).toEqual({ blockers: 0, warnings: 0, clean: true });
  });

  it("fails on unreconciled bank lines and subledger variances", () => {
    const f = { ...clean, unreconciledBankLines: 3, ar: { found: true, variance: 500 } };
    expect(status(f, "bank")).toBe("fail");
    expect(status(f, "ar_tie")).toBe("fail");
    expect(summariseChecklist(buildCloseChecklist(f)).blockers).toBe(2);
  });

  it("warns (not blocks) for drafts, opening balance, missing return and open year-end", () => {
    const f: CloseFacts = {
      ...clean,
      draftDocuments: 2,
      openingBalanceMinor: 1200,
      taxReturn: { applicable: true, filed: false },
      yearEnd: { closed: false },
    };
    expect(status(f, "drafts")).toBe("warn");
    expect(status(f, "opening_balance")).toBe("warn");
    expect(status(f, "tax_return")).toBe("warn");
    expect(status(f, "year_end")).toBe("warn");
    const s = summariseChecklist(buildCloseChecklist(f));
    expect(s.blockers).toBe(0);
    expect(s.warnings).toBe(4);
    expect(s.clean).toBe(false);
  });

  it("marks checks not applicable when the data does not exist", () => {
    const f: CloseFacts = {
      ...clean,
      ar: { found: false, variance: 0 },
      ap: null,
      openingBalanceMinor: null,
      taxReturn: null,
      yearEnd: null,
    };
    const items = buildCloseChecklist(f);
    expect(items.find((i) => i.id === "ar_tie")?.status).toBe("na");
    expect(items.find((i) => i.id === "ap_tie")?.status).toBe("na");
    expect(items.find((i) => i.id === "opening_balance")?.status).toBe("na");
    expect(items.find((i) => i.id === "tax_return")?.status).toBe("na");
    expect(items.find((i) => i.id === "year_end")).toBeUndefined();
  });

  it("uses singular wording for one item", () => {
    const items = buildCloseChecklist({ ...clean, unreconciledBankLines: 1 });
    expect(items.find((i) => i.id === "bank")?.detail).toMatch(/^1 bank line is not/);
  });
});

describe("period lock fresh-review preflight", () => {
  const reviewed = buildCloseChecklist(clean);
  const period = { id: "p1", end_date: "2026-12-31", status: "open" };
  const request = {
    periodId: "p1",
    periodEnd: "2026-12-31",
    latestPeriod: period,
    reviewed,
    latest: reviewed,
    acknowledged: false,
  };

  it("permits a clean, unchanged checklist", () => {
    expect(() => assertPeriodCloseReview(request)).not.toThrow();
  });

  it("refuses a period already locked or changed", () => {
    expect(() =>
      assertPeriodCloseReview({
        ...request,
        latestPeriod: { ...period, status: "locked" },
      }),
    ).toThrow("already locked");
    expect(() => assertPeriodCloseReview({ ...request, latestPeriod: undefined })).toThrow(
      "selected period changed",
    );
    expect(() =>
      assertPeriodCloseReview({
        ...request,
        latestPeriod: { ...period, end_date: "2027-12-31" },
      }),
    ).toThrow("selected period changed");
  });

  it("requires re-review when the live checks change, even with an earlier acknowledgement", () => {
    const changed = buildCloseChecklist({ ...clean, unreconciledBankLines: 2 });
    expect(() =>
      assertPeriodCloseReview({
        ...request,
        latest: changed,
        acknowledged: true,
      }),
    ).toThrow("checklist has changed");
    expect(() =>
      assertPeriodCloseReview({
        ...request,
        latest: reviewed.map((item) =>
          item.id === "bank" ? { ...item, detail: "Updated reconciliation result" } : item,
        ),
      }),
    ).toThrow("checklist has changed");
  });

  it("requires acknowledgement for an unchanged checklist with outstanding items", () => {
    const issues = buildCloseChecklist({ ...clean, draftDocuments: 1 });
    expect(() =>
      assertPeriodCloseReview({ ...request, reviewed: issues, latest: issues }),
    ).toThrow("Acknowledge");
    expect(() =>
      assertPeriodCloseReview({
        ...request,
        reviewed: issues,
        latest: issues,
        acknowledged: true,
      }),
    ).not.toThrow();
  });
});
