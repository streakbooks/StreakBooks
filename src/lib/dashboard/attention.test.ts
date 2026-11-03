import { describe, expect, it } from "vitest";
import { attentionPriority, buildDocumentAttention, type OpenAttentionDocument } from "./attention";

const doc = (
  id: string,
  due: string,
  overrides: Partial<OpenAttentionDocument> = {},
): OpenAttentionDocument => ({
  id,
  due_date: due,
  currency_code: "USD",
  total_minor: 10000,
  amount_paid_minor: 2000,
  amount_credited_minor: 1000,
  posted_journal_id: "posted-journal",
  invoice_number: "INV-" + id,
  bill_number: "BILL-" + id,
  contacts: { name: "Counterparty" },
  ...overrides,
});

describe("bookkeeping attention queue", () => {
  it("counts overdue and due soon from outstanding posted documents only", () => {
    const result = buildDocumentAttention(
      [
        doc("old", "2026-10-01"),
        doc("today", "2026-11-03"),
        doc("week", "2026-11-10"),
        doc("later", "2026-11-11"),
        doc("unposted", "2026-10-01", { posted_journal_id: null }),
        doc("settled", "2026-10-01", { amount_paid_minor: 10000, amount_credited_minor: 0 }),
      ],
      [
        doc("b-old", "2026-11-02", { supplier_invoice_number: "SUP-1" }),
        doc("b-soon", "2026-11-04", { currency_code: "EUR" }),
      ],
      "2026-11-03",
    );

    expect(result.overdueInvoices).toBe(1);
    expect(result.overdueBills).toBe(1);
    expect(result.dueSoonInvoices).toBe(2);
    expect(result.dueSoonBills).toBe(1);
    expect(result.items).toHaveLength(5);
    expect(result.items[0]?.id).toBe("old");
    expect(result.items[1]?.reference).toBe("SUP-1");
    expect(result.items.find((item) => item.id === "b-soon")?.currency).toBe("EUR");
    expect(result.items.find((item) => item.id === "old")?.outstandingMinor).toBe(7000);
  });

  it("does not combine currencies or return phantom balances", () => {
    const result = buildDocumentAttention(
      [
        doc("u", "2026-10-31", { currency_code: "USD", amount_credited_minor: 0 }),
        doc("e", "2026-10-31", { currency_code: "EUR", amount_credited_minor: 0 }),
      ],
      [],
      "2026-11-03",
    );
    expect(result.items.map((item) => item.currency)).toEqual(["EUR", "USD"]);
    expect(result.items.map((item) => item.outstandingMinor)).toEqual([8000, 8000]);
  });

  it("limits displayed records without losing true attention counts", () => {
    const rows = Array.from({ length: 25 }, (_, i) => doc("id-" + i, "2026-10-10"));
    const result = buildDocumentAttention(rows, [], "2026-11-03", 7, 3);
    expect(result.overdueInvoices).toBe(25);
    expect(result.items).toHaveLength(3);
  });

  it("handles malformed dates and boundary days without inventing tasks", () => {
    const result = buildDocumentAttention(
      [doc("bad", "invalid"), doc("tomorrow", "2026-11-04"), doc("later", "2026-11-20")],
      [],
      "2026-11-03",
      0,
    );
    expect(result.items).toHaveLength(0);
    expect(result.dueSoonInvoices).toBe(0);
    expect(result.overdueInvoices).toBe(0);
  });

  it("distinguishes urgent overdue balances from other review work", () => {
    expect(attentionPriority(4, "overdue")).toBe("urgent");
    expect(attentionPriority(4, "approval")).toBe("review");
    expect(attentionPriority(0, "overdue")).toBe("clear");
  });
});
