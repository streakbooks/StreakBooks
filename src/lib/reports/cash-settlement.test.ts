import { describe, expect, it } from "vitest";
import {
  recogniseCashSettlements,
  type CashSourceDocument,
  type CashSettlement,
} from "./cash-settlement";

const company = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const invoice = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const payment = (id: string, date: string, amount: bigint, sequence = 0): CashSettlement => ({
  id,
  companyId: company,
  documentId: invoice,
  settledOn: date,
  cashDeltaMinor: amount,
  fxRateToBase: "1",
  sequence,
  status: "posted",
});
const source = (patch: Partial<CashSourceDocument> = {}): CashSourceDocument => ({
  id: invoice,
  companyId: company,
  status: "posted",
  currencyCode: "USD",
  baseCurrencyCode: "USD",
  totalMinor: 120n,
  nonCashCreditMinor: 0n,
  components: [
    { accountId: "sales", kind: "net", amountMinor: 100n },
    { accountId: "output-tax", kind: "tax", amountMinor: 20n },
  ],
  settlements: [payment("receipt-1", "2026-10-15", 60n), payment("receipt-2", "2026-11-01", 60n)],
  ...patch,
});
const period = { from: "2026-11-01", to: "2026-11-30" };
const amounts = (rows: ReturnType<typeof recogniseCashSettlements>) =>
  rows.map((row) => row.components.map((component) => component.recognisedMinor));

describe("cash settlement source calculation (not yet a live cash-basis report)", () => {
  it("recognises partial invoice receipts by settlement date, not invoice date", () => {
    const nov = recogniseCashSettlements(source(), period);
    expect(nov).toHaveLength(1);
    expect(nov[0]!.settlementId).toBe("receipt-2");
    expect(amounts(nov)).toEqual([[50n, 10n]]);
    expect(nov[0]!.cashDeltaMinor).toBe(60n);
    expect(nov[0]!.fxRoundingBaseMinor).toBe(0n);
    expect(
      amounts(
        recogniseCashSettlements(source(), {
          from: "2026-10-01",
          to: "2026-11-30",
        }),
      ),
    ).toEqual([
      [50n, 10n],
      [50n, 10n],
    ]);
  });

  it("uses cumulative allocation to avoid losing the final tax cent", () => {
    const s = source({
      totalMinor: 101n,
      components: [
        { accountId: "sales", kind: "net", amountMinor: 100n },
        { accountId: "tax", kind: "tax", amountMinor: 1n },
      ],
      settlements: [payment("small", "2026-10-01", 1n), payment("rest", "2026-11-01", 100n)],
    });
    expect(
      amounts(
        recogniseCashSettlements(s, {
          from: "2026-10-01",
          to: "2026-11-30",
        }),
      ),
    ).toEqual([
      [1n, 0n],
      [99n, 1n],
    ]);
  });

  it("does not treat applied non-cash credit notes as receipts", () => {
    const s = source({
      totalMinor: 100n,
      nonCashCreditMinor: 30n,
      components: [
        { accountId: "sales", kind: "net", amountMinor: 80n },
        { accountId: "tax", kind: "tax", amountMinor: 20n },
      ],
      settlements: [payment("receipt", "2026-11-01", 70n)],
    });
    expect(amounts(recogniseCashSettlements(s, period))).toEqual([[56n, 14n]]);
  });

  it("recognises dated refunds/reversals as negative cash, restoring prior tax and net", () => {
    const s = source({
      totalMinor: 100n,
      components: [
        { accountId: "sales", kind: "net", amountMinor: 80n },
        { accountId: "tax", kind: "tax", amountMinor: 20n },
      ],
      settlements: [payment("receipt", "2026-10-01", 100n), payment("refund", "2026-11-01", -20n)],
    });
    const rows = recogniseCashSettlements(s, period);
    expect(amounts(rows)).toEqual([[-16n, -4n]]);
    expect(rows[0]!.cashBaseMinor).toBe(-20n);
    s.settlements[1]!.cashDeltaMinor = -100n;
    expect(amounts(recogniseCashSettlements(s, period))).toEqual([[-80n, -20n]]);
  });

  it("uses each settlement's posted FX rate and exposes rounding residual", () => {
    const s = source({
      currencyCode: "JPY",
      baseCurrencyCode: "USD",
      totalMinor: 2n,
      components: [
        { accountId: "sales", kind: "net", amountMinor: 1n },
        { accountId: "tax", kind: "tax", amountMinor: 1n },
      ],
      settlements: [{ ...payment("yen", "2026-11-01", 2n), fxRateToBase: "0.0067" }],
    });
    const rows = recogniseCashSettlements(s, period);
    expect(rows[0]!.cashBaseMinor).toBe(1n);
    expect(rows[0]!.components.map((item) => item.recognisedBaseMinor)).toEqual([1n, 1n]);
    expect(rows[0]!.fxRoundingBaseMinor).toBe(-1n);
    expect(
      rows[0]!.components.reduce((sum, item) => sum + item.recognisedBaseMinor, 0n) +
        rows[0]!.fxRoundingBaseMinor,
    ).toBe(rows[0]!.cashBaseMinor);
  });

  it("uses different settlement rates for separate partial foreign-currency payments", () => {
    const s = source({
      currencyCode: "EUR",
      baseCurrencyCode: "USD",
      settlements: [
        { ...payment("first", "2026-10-01", 60n), fxRateToBase: "1.1" },
        { ...payment("second", "2026-11-01", 60n), fxRateToBase: "1.2" },
      ],
    });
    const rows = recogniseCashSettlements(s, { from: "2026-10-01", to: "2026-11-30" });
    expect(rows.map((row) => row.cashBaseMinor)).toEqual([66n, 72n]);
    expect(rows.map((row) => row.components[0]!.recognisedBaseMinor)).toEqual([55n, 60n]);
  });

  it("sorts by immutable settlement sequence, leaves input untouched and ignores future movements", () => {
    const settlements = [
      payment("refund", "2026-11-01", -20n, 2),
      payment("receipt", "2026-11-01", 60n, 1),
      { ...payment("future", "2026-12-01", 100n), status: "void" as const },
    ];
    const s = source({ settlements });
    const rows = recogniseCashSettlements(s, period);
    expect(rows.map((row) => row.settlementId)).toEqual(["receipt", "refund"]);
    expect(rows.map((row) => row.cashDeltaMinor)).toEqual([60n, -20n]);
    expect(s.settlements[0]!.id).toBe("refund");
  });

  it("allows no settlements without inventing cash-basis revenue", () => {
    expect(recogniseCashSettlements(source({ settlements: [] }), period)).toEqual([]);
  });

  it.each([
    ["draft document", { status: "draft" as const }, "posted, non-void"],
    ["void document", { status: "void" as const }, "posted, non-void"],
    ["bad document gross", { totalMinor: 119n }, "do not reconcile"],
    ["invalid credit", { nonCashCreditMinor: 121n }, "Invalid cash source"],
    [
      "invalid date",
      { settlements: [payment("a", "2026-02-30", 20n)] },
      "Invalid cash settlement date",
    ],
    [
      "wrong company",
      { settlements: [{ ...payment("a", "2026-11-01", 20n), companyId: "other" }] },
      "Cross-organisation",
    ],
    [
      "wrong document",
      { settlements: [{ ...payment("a", "2026-11-01", 20n), documentId: "other" }] },
      "mismatched",
    ],
    [
      "void receipt",
      { settlements: [{ ...payment("a", "2026-11-01", 20n), status: "void" as const }] },
      "Voided cash settlement",
    ],
    ["overpayment", { settlements: [payment("a", "2026-11-01", 121n)] }, "exceeds uncredited"],
    [
      "refund before receipt",
      { settlements: [payment("a", "2026-11-01", -1n)] },
      "exceeds uncredited",
    ],
    [
      "duplicate source",
      { settlements: [payment("a", "2026-11-01", 10n), payment("a", "2026-11-02", 10n)] },
      "Duplicate",
    ],
    [
      "invalid FX",
      { settlements: [{ ...payment("a", "2026-11-01", 10n), fxRateToBase: "0" }] },
      "positive posted FX",
    ],
  ])("fails closed for %s", (_name, patch, message) => {
    expect(() => recogniseCashSettlements(source(patch), period)).toThrow(message);
  });

  it("fails closed when credits plus cash exceed the invoice or bill gross", () => {
    expect(() =>
      recogniseCashSettlements(
        source({
          nonCashCreditMinor: 30n,
        }),
        { from: "2026-10-01", to: "2026-11-30" },
      ),
    ).toThrow("exceeds uncredited");
  });

  it("rejects invalid report dates before reading source facts", () => {
    expect(() =>
      recogniseCashSettlements(source(), {
        from: "2026-11-31",
        to: "2026-12-01",
      }),
    ).toThrow("valid reporting period");
  });
});
