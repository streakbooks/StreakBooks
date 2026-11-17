import { describe, expect, it } from "vitest";
import {
  assertBillVoidDate,
  assertCreditNoteVoidDate,
  assertPurchaseDocVoidDate,
  assertSupplierPaymentVoidDate,
} from "./bill-void";

describe("assertPurchaseDocVoidDate", () => {
  it("accepts dates on or after the document date up to today", () => {
    expect(
      assertPurchaseDocVoidDate({
        documentDate: "2026-01-10",
        documentLabel: "bill",
        voidDate: "2026-01-10",
        today: "2026-11-17",
      }),
    ).toBe("2026-01-10");
  });

  it("rejects dates before the document or after today", () => {
    expect(() =>
      assertBillVoidDate({ billDate: "2026-01-10", voidDate: "2026-01-09", today: "2026-11-17" }),
    ).toThrow(/before the bill date/);
    expect(() =>
      assertCreditNoteVoidDate({
        creditDate: "2026-02-01",
        voidDate: "2026-11-18",
        today: "2026-11-17",
      }),
    ).toThrow(/future/);
    expect(() =>
      assertCreditNoteVoidDate({
        creditDate: "2026-02-01",
        voidDate: "2026-01-31",
        today: "2026-11-17",
      }),
    ).toThrow(/before the credit note date/);
    expect(() =>
      assertSupplierPaymentVoidDate({
        paymentDate: "2026-03-01",
        voidDate: "2026-02-28",
        today: "2026-11-17",
      }),
    ).toThrow(/before the payment date/);
    expect(
      assertSupplierPaymentVoidDate({
        paymentDate: "2026-03-01",
        voidDate: "2026-03-15",
        today: "2026-11-17",
      }),
    ).toBe("2026-03-15");
  });
});
