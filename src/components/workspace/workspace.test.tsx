import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { EditableLineItemGrid } from "@/components/common/EditableLineItemGrid";
import { TableCell, TableRow } from "@/components/ui/table";

describe("shared workspaces", () => {
  it("ListWorkspace exposes labelled section chrome and optional insight rail", () => {
    const html = renderToStaticMarkup(
      <ListWorkspace
        title="Banking"
        description="Accounts"
        actions={<button type="button">Import</button>}
        insights={<p>Next step</p>}
      >
        <p>Rows</p>
      </ListWorkspace>,
    );
    expect(html).toContain('data-slot="list-workspace"');
    expect(html).toContain('aria-label="Banking"');
    expect(html).toContain("Banking");
    expect(html).toContain("Accounts");
    expect(html).toContain("Import");
    expect(html).toContain('aria-label="Contextual insights"');
    expect(html).toContain("Next step");
    expect(html).toContain("Rows");
  });

  it("RecordWorkspace exposes labelled section chrome", () => {
    const html = renderToStaticMarkup(
      <RecordWorkspace title="Invoice INV-1" meta={<span>Paid</span>}>
        <div>Body</div>
      </RecordWorkspace>,
    );
    expect(html).toContain('data-slot="record-workspace"');
    expect(html).toContain('aria-label="Invoice INV-1"');
    expect(html).toContain("Paid");
    expect(html).toContain("Body");
    expect(html).not.toContain("Contextual insights");
  });

  it("WorkspaceInsights renders ledger facts and omits empty rails", () => {
    const html = renderToStaticMarkup(
      <WorkspaceInsights
        facts={[{ label: "Outstanding", value: "£12.00" }]}
        footer="Ledger-backed only."
      />,
    );
    expect(html).toContain('data-slot="workspace-insights"');
    expect(html).toContain("Outstanding");
    expect(html).toContain("£12.00");
    expect(html).toContain("Ledger-backed only.");
    expect(renderToStaticMarkup(<WorkspaceInsights />)).toBe("");
  });

  it("omits undefined optional header props under exactOptionalPropertyTypes-safe spreading", () => {
    const html = renderToStaticMarkup(
      <ListWorkspace title="Contacts">
        <span>Directory</span>
      </ListWorkspace>,
    );
    expect(html).toContain("Contacts");
    expect(html).toContain("Directory");
  });

  it("TransactionWorkspace exposes details, lines, totals and sticky action slots", () => {
    const html = renderToStaticMarkup(
      <TransactionWorkspace
        title="New invoice"
        meta={<span>Draft</span>}
        details={<div>Customer field</div>}
        lines={<div>Line grid</div>}
        totals={<div>Total 10.00</div>}
        stickyActions={<button type="button">Save</button>}
        support={<div>Notes</div>}
      />,
    );
    expect(html).toContain('data-slot="transaction-workspace"');
    expect(html).toContain('aria-label="New invoice"');
    expect(html).toContain("Draft");
    expect(html).toContain('data-slot="transaction-details"');
    expect(html).toContain("Customer field");
    expect(html).toContain('data-slot="transaction-lines"');
    expect(html).toContain("Line grid");
    expect(html).toContain('data-slot="transaction-totals"');
    expect(html).toContain("Total 10.00");
    expect(html).toContain('data-slot="transaction-sticky-actions"');
    expect(html).toContain("Save");
    expect(html).toContain('data-slot="transaction-support"');
    expect(html).toContain("Notes");
  });

  it("TotalsSummary renders labelled money rows without inventing values", () => {
    const html = renderToStaticMarkup(
      <TotalsSummary
        lines={[
          { id: "sub", label: "Subtotal", value: "£10.00" },
          { id: "tax", label: "Tax", value: "£2.00", emphasis: "muted" },
          { id: "total", label: "Total", value: "£12.00", emphasis: "total" },
        ]}
      />,
    );
    expect(html).toContain('data-slot="totals-summary"');
    expect(html).toContain("Subtotal");
    expect(html).toContain("£10.00");
    expect(html).toContain("Total");
    expect(html).toContain("£12.00");
  });

  it("EditableLineItemGrid exposes sticky header chrome and add-row control", () => {
    const html = renderToStaticMarkup(
      <EditableLineItemGrid
        columns={[
          { id: "item", header: "Item" },
          { id: "qty", header: "Qty", align: "right" },
        ]}
        onAddRow={() => undefined}
        addRowLabel="Add line"
      >
        <TableRow>
          <TableCell>Widget</TableCell>
          <TableCell>2</TableCell>
        </TableRow>
      </EditableLineItemGrid>,
    );
    expect(html).toContain('data-slot="editable-line-item-grid"');
    expect(html).toContain("Item");
    expect(html).toContain("Qty");
    expect(html).toContain("Widget");
    expect(html).toContain("Add line");
  });
});
