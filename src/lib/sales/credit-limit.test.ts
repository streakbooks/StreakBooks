import { describe, expect, it } from "vitest";
import { assessCreditLimit, invoiceOutstandingMinor } from "@/lib/sales/credit-limit";

describe("invoiceOutstandingMinor", () => {
  it("never goes negative and ignores bad inputs", () => {
    expect(
      invoiceOutstandingMinor({
        id: "1",
        currencyCode: "GBP",
        status: "authorised",
        totalMinor: 1000,
        amountPaidMinor: 400,
        amountCreditedMinor: 100,
      }),
    ).toBe(500);
    expect(
      invoiceOutstandingMinor({
        id: "1",
        currencyCode: "GBP",
        status: "authorised",
        totalMinor: 100,
        amountPaidMinor: 200,
        amountCreditedMinor: 0,
      }),
    ).toBe(0);
  });
});

describe("assessCreditLimit", () => {
  const open = (id: string, total: number, paid = 0, credited = 0, currencyCode = "GBP") => ({
    id,
    currencyCode,
    status: "authorised",
    totalMinor: total,
    amountPaidMinor: paid,
    amountCreditedMinor: credited,
  });

  it("reports no_limit when limit is null or zero", () => {
    const a = assessCreditLimit({
      creditLimitMinor: null,
      limitCurrencyCode: "GBP",
      openInvoices: [open("a", 500)],
      candidate: null,
    });
    expect(a.status).toBe("no_limit");
    expect(a.overLimit).toBe(false);
  });

  it("flags over_limit when draft would breach", () => {
    const a = assessCreditLimit({
      creditLimitMinor: 1000,
      limitCurrencyCode: "GBP",
      openInvoices: [open("a", 800, 0, 0)],
      candidate: {
        id: "draft",
        currencyCode: "GBP",
        status: "draft",
        totalMinor: 300,
        amountPaidMinor: 0,
        amountCreditedMinor: 0,
      },
    });
    expect(a.status).toBe("over_limit");
    expect(a.existingExposureMinor).toBe(800);
    expect(a.proposedInvoiceMinor).toBe(300);
    expect(a.proposedExposureMinor).toBe(1100);
    expect(a.overLimit).toBe(true);
  });

  it("does not double-count the candidate when it is already open", () => {
    const a = assessCreditLimit({
      creditLimitMinor: 1000,
      limitCurrencyCode: "GBP",
      openInvoices: [open("a", 600), open("b", 500)],
      candidate: open("b", 500),
    });
    expect(a.existingExposureMinor).toBe(600);
    expect(a.proposedInvoiceMinor).toBe(500);
    expect(a.proposedExposureMinor).toBe(1100);
    expect(a.overLimit).toBe(true);
  });

  it("ignores other-currency invoices in the numeric total but marks mixed review", () => {
    const a = assessCreditLimit({
      creditLimitMinor: 10_000,
      limitCurrencyCode: "GBP",
      openInvoices: [open("a", 100, 0, 0, "GBP"), open("b", 999_999, 0, 0, "EUR")],
      candidate: null,
    });
    expect(a.existingExposureMinor).toBe(100);
    expect(a.mixedCurrencyOpen).toBe(true);
    expect(a.status).toBe("mixed_currency_review");
    expect(a.overLimit).toBe(false);
  });

  it("stays ok when within limit", () => {
    const a = assessCreditLimit({
      creditLimitMinor: 1000,
      limitCurrencyCode: "GBP",
      openInvoices: [open("a", 400, 100, 0)],
      candidate: {
        id: "d",
        currencyCode: "GBP",
        status: "draft",
        totalMinor: 200,
        amountPaidMinor: 0,
        amountCreditedMinor: 0,
      },
    });
    expect(a.status).toBe("ok");
    expect(a.proposedExposureMinor).toBe(500);
  });
});
