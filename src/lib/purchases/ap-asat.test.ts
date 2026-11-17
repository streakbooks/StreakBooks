import { describe, expect, it } from "vitest";
import {
  buildAgedPayablesAsAt,
  billOutstandingAsAt,
  unappliedPaymentAsAt,
  unappliedPurchaseCreditAsAt,
  type AsAtApAllocation,
  type AsAtBill,
  type AsAtPurchaseCredit,
  type AsAtSupplierPayment,
} from "./ap-asat";

const bill = (over: Partial<AsAtBill> = {}): AsAtBill => ({
  id: "b1",
  contactId: "s1",
  contactName: "Supplier Co",
  number: "BILL-1",
  currencyCode: "GBP",
  billDate: "2026-03-01",
  dueDate: "2026-03-31",
  totalMinor: 10000,
  status: "paid",
  voidDate: null,
  ...over,
});

const alloc = (over: Partial<AsAtApAllocation> = {}): AsAtApAllocation => ({
  billId: "b1",
  amountMinor: 4000,
  effectiveDate: "2026-04-10",
  reversedOn: null,
  ...over,
});

describe("billOutstandingAsAt", () => {
  it("ignores allocations dated after the as-at date", () => {
    const allocs = [alloc({ amountMinor: 10000, effectiveDate: "2026-04-10" })];
    expect(billOutstandingAsAt(bill(), allocs, "2026-03-31")).toBe(10000);
    expect(billOutstandingAsAt(bill(), allocs, "2026-04-10")).toBe(0);
  });

  it("counts partial allocations dated on or before the date", () => {
    const allocs = [
      alloc({ amountMinor: 4000, effectiveDate: "2026-03-15" }),
      alloc({ amountMinor: 1000, effectiveDate: "2026-04-01" }),
    ];
    expect(billOutstandingAsAt(bill(), allocs, "2026-03-31")).toBe(6000);
    expect(billOutstandingAsAt(bill(), allocs, "2026-04-30")).toBe(5000);
  });

  it("treats a reversed allocation as active until the reversal date", () => {
    const allocs = [alloc({ effectiveDate: "2026-03-10", reversedOn: "2026-04-05" })];
    expect(billOutstandingAsAt(bill(), allocs, "2026-03-31")).toBe(6000);
    expect(billOutstandingAsAt(bill(), allocs, "2026-04-05")).toBe(10000);
  });

  it("excludes drafts, future bills, and bills voided on/before the date", () => {
    expect(billOutstandingAsAt(bill({ status: "draft" }), [], "2026-12-31")).toBe(0);
    expect(billOutstandingAsAt(bill({ billDate: "2026-05-01" }), [], "2026-03-31")).toBe(0);
    expect(
      billOutstandingAsAt(bill({ status: "void", voidDate: "2026-04-02" }), [], "2026-04-02"),
    ).toBe(0);
    expect(
      billOutstandingAsAt(bill({ status: "void", voidDate: "2026-04-02" }), [], "2026-04-01"),
    ).toBe(10000);
    expect(billOutstandingAsAt(bill({ status: "void", voidDate: null }), [], "2026-03-15")).toBe(0);
  });
});

describe("unapplied payments and purchase credits", () => {
  const payment = (over: Partial<AsAtSupplierPayment> = {}): AsAtSupplierPayment => ({
    id: "p1",
    contactId: "s1",
    contactName: "Supplier Co",
    reference: "BACS",
    currencyCode: "GBP",
    paymentDate: "2026-03-20",
    amountMinor: 5000,
    status: "posted",
    voidDate: null,
    unallocatedMinor: 5000,
    ...over,
  });

  const credit = (over: Partial<AsAtPurchaseCredit> = {}): AsAtPurchaseCredit => ({
    id: "c1",
    contactId: "s1",
    contactName: "Supplier Co",
    number: "SCN-1",
    currencyCode: "GBP",
    creditDate: "2026-03-15",
    totalMinor: 2000,
    status: "authorised",
    voidDate: null,
    amountAllocatedMinor: 0,
    ...over,
  });

  it("shows unapplied payment cash until allocated", () => {
    expect(unappliedPaymentAsAt(payment(), [], "2026-03-31")).toBe(5000);
    expect(
      unappliedPaymentAsAt(
        payment({ unallocatedMinor: 1000 }),
        [alloc({ billId: "b1", amountMinor: 4000, effectiveDate: "2026-03-25" })],
        "2026-03-31",
      ),
    ).toBe(1000);
  });

  it("shows unapplied supplier credit until allocated", () => {
    expect(unappliedPurchaseCreditAsAt(credit(), [], "2026-03-31")).toBe(2000);
    expect(
      unappliedPurchaseCreditAsAt(
        credit({ amountAllocatedMinor: 2000 }),
        [alloc({ amountMinor: 2000, effectiveDate: "2026-04-01" })],
        "2026-03-31",
      ),
    ).toBe(2000);
  });
});

describe("buildAgedPayablesAsAt", () => {
  it("keeps currencies separate and ages open bills at the as-at date", () => {
    const report = buildAgedPayablesAsAt({
      asOf: "2026-03-31",
      bills: [
        bill({ id: "gbp", currencyCode: "GBP", totalMinor: 10000, status: "authorised" }),
        bill({
          id: "eur",
          currencyCode: "EUR",
          totalMinor: 5000,
          status: "authorised",
          number: "BILL-EUR",
        }),
      ],
      payments: [],
      creditNotes: [],
      paymentAllocations: [
        {
          paymentId: "p-late",
          billId: "gbp",
          amountMinor: 10000,
          effectiveDate: "2026-04-10",
          reversedOn: null,
        },
      ],
      creditAllocations: [],
    });
    expect(report.totalsByCurrency).toHaveLength(2);
    expect(report.totalsByCurrency.find((t) => t.currency_code === "GBP")?.total).toBe(10000);
    expect(report.totalsByCurrency.find((t) => t.currency_code === "EUR")?.total).toBe(5000);
    const gbpRow = report.rows.find((r) => r.currency_code === "GBP");
    expect(gbpRow?.current).toBe(10000);
  });
});
