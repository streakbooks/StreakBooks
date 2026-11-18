import { describe, expect, it } from "vitest";
import {
  assertSupplierStatementRange,
  buildSupplierStatement,
  type SupplierStatementDoc,
} from "./supplier-statement";

const bill = (over: Partial<SupplierStatementDoc>): SupplierStatementDoc => ({
  kind: "bill",
  id: "b",
  date: "2026-09-10",
  currencyCode: "GBP",
  amountMinor: 10000,
  reference: "SI-1",
  status: "authorised",
  voidDate: null,
  ...over,
});

describe("buildSupplierStatement", () => {
  it("carries prior bills/payments/credits into opening balance", () => {
    const [gbp] = buildSupplierStatement(
      [
        bill({ id: "b1", date: "2026-09-10", amountMinor: 10000 }),
        bill({
          id: "p1",
          kind: "payment",
          date: "2026-09-20",
          amountMinor: 3000,
          reference: "PMT",
          status: "paid",
        }),
        bill({ id: "b2", date: "2026-10-05", amountMinor: 2500, reference: "SI-2" }),
      ],
      { from: "2026-10-01", to: "2026-10-31" },
    );
    expect(gbp!.opening_balance_minor).toBe(7000);
    expect(gbp!.lines).toHaveLength(1);
    expect(gbp!.lines[0]!.type).toBe("bill");
    expect(gbp!.lines[0]!.description).toBe("Bill");
    expect(gbp!.closing_balance_minor).toBe(9500);
  });

  it("posts a void reversing line on the void date, not by rewriting opening", () => {
    const [gbp] = buildSupplierStatement(
      [
        bill({
          id: "b1",
          date: "2026-09-01",
          amountMinor: 5000,
          status: "void",
          voidDate: "2026-10-05",
        }),
      ],
      { from: "2026-10-01", to: "2026-10-31" },
    );
    expect(gbp!.opening_balance_minor).toBe(5000);
    expect(gbp!.lines).toHaveLength(1);
    expect(gbp!.lines[0]!.type).toBe("void");
    expect(gbp!.closing_balance_minor).toBe(0);
  });

  it("omits legacy voids without a void date", () => {
    const res = buildSupplierStatement(
      [bill({ id: "b1", status: "void", voidDate: null })],
      { from: null, to: null },
    );
    expect(res).toHaveLength(0);
  });

  it("groups currencies separately and never nets them", () => {
    const res = buildSupplierStatement(
      [
        bill({ id: "b-gbp", currencyCode: "GBP", amountMinor: 1000 }),
        bill({ id: "b-eur", currencyCode: "EUR", amountMinor: 2000 }),
      ],
      { from: null, to: null },
    );
    expect(res.map((c) => c.currency_code)).toEqual(["EUR", "GBP"]);
    expect(res.find((c) => c.currency_code === "GBP")!.closing_balance_minor).toBe(1000);
    expect(res.find((c) => c.currency_code === "EUR")!.closing_balance_minor).toBe(2000);
  });

  it("rejects an inverted date range", () => {
    expect(() => assertSupplierStatementRange("2026-11-01", "2026-10-01")).toThrow(/From date/);
  });
});
