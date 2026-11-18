import { describe, expect, it, vi } from "vitest";

// Exercise actual route registration/search validation without mounting or fetching ledgers.
vi.mock("@/screens/accounting", () => ({ Accounting: () => null }));
vi.mock("@/screens/banking/transfers", () => ({
  Transfers: () => null,
  NewTransfer: () => null,
}));
vi.mock("@/screens/sales/invoices.new", () => ({ NewInvoiceRoute: () => null }));
vi.mock("@/screens/sales/receipts.new", () => ({ NewReceiptRoute: () => null }));
import { Route as AccountingRoute } from "@/routes/_authenticated/accounting";
import { Route as TransferRoute } from "@/routes/_authenticated/banking/transfers.index";
import { Route as TransferNewRoute } from "@/routes/_authenticated/banking/transfers.new";
import { Route as InvoiceRoute } from "@/routes/_authenticated/sales/invoices.new";
import { Route as ReceiptRoute } from "@/routes/_authenticated/sales/receipts.new";

function functionValidator(value: unknown): (raw: Record<string, unknown>) => unknown {
  if (typeof value !== "function") throw new Error("Expected a route search validation function");
  return (raw) => value(raw);
}

describe("financial deep links after screen extraction", () => {
  it("keeps invoice customer context and rejects non-string values", () => {
    const validate = functionValidator(InvoiceRoute.options.validateSearch);
    expect(validate({ contactId: "customer-a", ignored: "x" })).toEqual({
      contactId: "customer-a",
    });
    expect(validate({ contactId: 42 })).toEqual({});
  });
  it("keeps the receipt customer/invoice pair without silently changing allocation context", () => {
    const validate = functionValidator(ReceiptRoute.options.validateSearch);
    expect(validate({ contactId: "customer-a", invoiceId: "invoice-a" })).toEqual({
      contactId: "customer-a",
      invoiceId: "invoice-a",
    });
    expect(validate({ contactId: {}, invoiceId: 42 })).toEqual({});
  });
  it("preserves transfer amount text and direction without floating-point conversion", () => {
    const validateList = functionValidator(TransferRoute.options.validateSearch);
    const validateNew = functionValidator(TransferNewRoute.options.validateSearch);
    for (const validate of [validateList, validateNew]) {
      expect(validate({ bankAccountId: "bank-a", amount: "1,250.50", direction: "in" })).toEqual({
        bankAccountId: "bank-a",
        amount: "1,250.50",
        direction: "in",
      });
      expect(validate({ amount: 1250.5, direction: "sideways" })).toEqual({});
    }
  });
  it("keeps journal and period links used by accounting drill-downs", () => {
    const validate = functionValidator(AccountingRoute.options.validateSearch);
    const period = "00000000-0000-4000-8000-000000000001";
    expect(validate({ tab: "periods", journal: "journal-a", period })).toEqual({
      tab: "periods",
      journal: "journal-a",
      period,
    });
  });
  it("rejects unknown accounting tabs and invalid period identifiers", () => {
    expect(
      functionValidator(AccountingRoute.options.validateSearch)({
        tab: "unknown",
        journal: 42,
        period: "not-an-id",
      }),
    ).toEqual({ tab: undefined, journal: undefined, period: undefined });
  });
});
