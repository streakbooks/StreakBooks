import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BillMobileCards, type BillMobileRow } from "./BillMobileCards";

const base: BillMobileRow = {
  id: "bill-1",
  display_reference: "BILL-2026-001",
  bill_date: "2026-10-01",
  due_date: "2026-10-31",
  status: "authorised",
  document_total_minor: 7500,
  balance_due_minor: 3500,
  currency_code: "USD",
  days_overdue: 7,
  attachment_count: 1,
  contacts: { name: "Test Supplier", account_number: null },
};

function render(row: BillMobileRow, selected = false): string {
  return renderToStaticMarkup(
    <BillMobileCards
      rows={[row]}
      selected={selected ? new Set([row.id]) : new Set()}
      density="comfortable"
      baseCurrency="USD"
      money={(amount, currency) => currency + " " + (amount / 100).toFixed(2)}
      onSelect={() => {}}
      onPreview={() => {}}
      onOpen={() => {}}
      onOpenFiles={() => {}}
    />,
  );
}

describe("Premium mobile bill status cards", () => {
  it("visibly marks overdue outstanding authorised bills in danger tone", () => {
    const markup = render(base);
    expect(markup).toContain('data-tone="danger"');
    expect(markup).toContain("Overdue");
    expect(markup).toContain("BILL-2026-001");
    expect(markup).toContain("USD 35.00");
    expect(markup).toContain("text-destructive");
  });

  it("never falsely marks paid, void, draft or fully settled bills as overdue", () => {
    for (const status of ["paid", "void", "draft", "cancelled"]) {
      const markup = render({ ...base, status });
      expect(markup).not.toContain('data-tone="danger"');
      expect(markup).not.toContain("text-destructive");
    }
    const settled = render({ ...base, balance_due_minor: 0 });
    expect(settled).not.toContain('data-tone="danger"');
  });

  it("retains readable controls, selection and actual attachment actions", () => {
    const markup = render(base, true);
    expect(markup).toContain('aria-label="Select bill BILL-2026-001"');
    expect(markup).toContain('aria-label="Preview bill BILL-2026-001"');
    expect(markup).toContain('aria-label="Open bill BILL-2026-001"');
    expect(markup).toContain('aria-label="Open attachments for bill BILL-2026-001"');
    expect(markup).toContain("Test Supplier");
  });

  it("preserves unposted AP distinction for drafts", () => {
    const markup = render({ ...base, status: "draft" });
    expect(markup).toContain("Unposted");
    expect(markup).toContain('data-tone="neutral"');
  });
});
