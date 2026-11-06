import { describe, expect, it } from "vitest";
import { normalizeCashAllocationHistory } from "./cash-source";

type Row = Record<string, unknown>;
const companyId = "company";
const parent = {
  id: "payment",
  company_id: companyId,
  posted_journal_id: "payment-journal",
  payment_date: "2026-10-05",
};
const original = {
  id: "allocation",
  company_id: companyId,
  payment_id: "payment",
  bill_id: "bill",
  amount_minor: "3000",
  allocated_on: "2026-10-05",
};
const options = {
  companyId,
  sourceTable: "supplier_payment_allocations",
  parentKey: "payment_id",
  parents: [parent],
  parentDateKey: "payment_date",
  journalDates: new Map([["payment-journal", "2026-10-05"]]),
};
const event = (operation: string, date: string, sequence: string, row: Row = original): Row => ({
  id: `event-${sequence}`,
  company_id: companyId,
  source_table: options.sourceTable,
  allocation_id: "allocation",
  operation,
  recorded_at: `${date}T12:00:00.000Z`,
  event_seq: sequence,
  source_row: { ...row },
});

describe("dated cash allocation archive versions", () => {
  it("ignores active and archived allocations whose source payment never posted", () => {
    expect(
      normalizeCashAllocationHistory(
        [original],
        [{ ...event("DELETE", "2026-11-20", "1"), recorded_at: null }],
        { ...options, parents: [{ ...parent, posted_journal_id: null }] },
      ),
    ).toEqual([]);
  });

  it("retains the old amount until its update and uses the current amount from that date", () => {
    const rows = normalizeCashAllocationHistory(
      [{ ...original, amount_minor: "6000" }],
      [event("UPDATE", "2026-11-01", "1")],
      options,
    );
    expect(rows).toMatchObject([
      { amount_minor: "3000", allocated_on: "2026-10-05", reversed_on: "2026-11-01" },
      { amount_minor: "6000", allocated_on: "2026-11-01" },
    ]);
    expect(new Set(rows.map((row) => row["id"])).size).toBe(2);
  });

  it("dates a removed application without inventing a bank reversal", () => {
    expect(
      normalizeCashAllocationHistory([], [event("DELETE", "2026-11-20", "1")], options),
    ).toMatchObject([
      { amount_minor: "3000", allocated_on: "2026-10-05", reversed_on: "2026-11-20" },
    ]);
  });

  it("records same-day compensation as a zero-duration classification", () => {
    const compensated = { ...original, allocated_on: "2026-11-20" };
    expect(
      normalizeCashAllocationHistory(
        [],
        [event("DELETE", "2026-11-20", "1", compensated)],
        options,
      ),
    ).toMatchObject([{ allocated_on: "2026-11-20", reversed_on: "2026-11-20" }]);
  });

  it("orders future events within one transaction by exact bigint sequence", () => {
    const intermediate = { ...original, amount_minor: "4500" };
    const rows = normalizeCashAllocationHistory(
      [{ ...original, amount_minor: "6000" }],
      [
        event("UPDATE", "2026-11-01", "9007199254740994", intermediate),
        event("UPDATE", "2026-11-01", "9007199254740993"),
      ],
      options,
    );
    expect(rows.map((row) => row["amount_minor"])).toEqual(["3000", "4500", "6000"]);
    expect(rows.map((row) => row["allocated_on"])).toEqual([
      "2026-10-05",
      "2026-11-01",
      "2026-11-01",
    ]);
  });

  it("refuses ambiguous unordered legacy versions and cross-company archives", () => {
    const events = [
      event("UPDATE", "2026-11-01", "1"),
      event("UPDATE", "2026-11-01", "2", { ...original, amount_minor: "4500" }),
    ].map((row) => ({ ...row, event_seq: null }));
    expect(() =>
      normalizeCashAllocationHistory([{ ...original, amount_minor: "6000" }], events, options),
    ).toThrow("Ambiguous legacy");
    const crossCompany = event("DELETE", "2026-11-01", "1");
    crossCompany["company_id"] = "other";
    expect(() => normalizeCashAllocationHistory([], [crossCompany], options)).toThrow(
      "cross-company",
    );
  });

  it("uses the actual dated posted void when a delete is performed later", () => {
    const voidOptions = {
      ...options,
      parents: [{ ...parent, void_journal_id: "void" }],
      journalDates: new Map([...options.journalDates, ["void", "2026-11-15"]]),
    };
    expect(
      normalizeCashAllocationHistory([], [event("DELETE", "2026-11-20", "1")], voidOptions)[0],
    ).toMatchObject({ reversed_on: "2026-11-15" });
  });
});
