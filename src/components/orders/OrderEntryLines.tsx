import { type ClipboardEvent, type KeyboardEvent } from "react";
import { Trash2 } from "lucide-react";
import { AccountLookup } from "@/components/lookup";
import { EditableLineItemGrid } from "@/components/common/EditableLineItemGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TableCell, TableRow } from "@/components/ui/table";
import { emptyOrderLine, type PurchaseOrderLineForm } from "@/lib/purchases/purchase-order";
import { interpretLineGridKey } from "@/lib/ui/line-grid-keyboard";
import { parseLineGridClipboard } from "@/lib/ui/line-grid-paste";

const ORDER_NUMERIC_COLS = ["quantity", "unitPrice", "discount", "taxPercent"] as const;

export function OrderEntryLines({
  lines,
  onChange,
  accounts,
  companyId,
  currency,
  disabled = false,
}: {
  lines: PurchaseOrderLineForm[];
  onChange: (lines: PurchaseOrderLineForm[]) => void;
  accounts: Array<{ id: string; code: string; name: string }>;
  companyId: string;
  currency: string;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<PurchaseOrderLineForm>) =>
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const onNumericKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colKey: (typeof ORDER_NUMERIC_COLS)[number],
  ) => {
    if (disabled) return;
    const colIndex = ORDER_NUMERIC_COLS.indexOf(colKey);
    if (colIndex < 0) return;
    const action = interpretLineGridKey(event.key, {
      shiftKey: event.shiftKey,
      atLastRow: rowIndex === lines.length - 1,
      atLastCol: colIndex === ORDER_NUMERIC_COLS.length - 1,
    });
    if (action.type === "none") return;
    if (action.type === "add-row") {
      event.preventDefault();
      if (lines.length >= 200) return;
      onChange([...lines, emptyOrderLine()]);
      queueMicrotask(() => {
        document
          .querySelector<HTMLElement>(`[data-order-entry-cell="${rowIndex + 1}-${colKey}"]`)
          ?.focus();
      });
      return;
    }
    if (
      action.type === "move" &&
      (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      const nextRow = Math.max(0, Math.min(lines.length - 1, rowIndex + action.rowDelta));
      document
        .querySelector<HTMLElement>(`[data-order-entry-cell="${nextRow}-${colKey}"]`)
        ?.focus();
    }
  };

  const onNumericPaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    colKey: (typeof ORDER_NUMERIC_COLS)[number],
  ) => {
    if (disabled) return;
    const grid = parseLineGridClipboard(event.clipboardData.getData("text"));
    if (grid.length <= 1 && (grid[0]?.length ?? 0) <= 1) return;
    event.preventDefault();
    const startCol = ORDER_NUMERIC_COLS.indexOf(colKey);
    if (startCol < 0) return;
    const next = lines.map((line) => ({ ...line }));
    for (let r = 0; r < grid.length; r++) {
      const targetRow = rowIndex + r;
      while (next.length <= targetRow && next.length < 200) {
        next.push(emptyOrderLine());
      }
      if (targetRow >= next.length) break;
      const cells = grid[r] ?? [];
      for (let c = 0; c < cells.length; c++) {
        const key = ORDER_NUMERIC_COLS[startCol + c];
        if (!key) break;
        next[targetRow] = { ...next[targetRow]!, [key]: cells[c] ?? "" };
      }
    }
    onChange(next);
  };

  return (
    <fieldset disabled={disabled} className="disabled:opacity-70">
      <EditableLineItemGrid
        aria-label="Order lines"
        columns={[
          {
            id: "description",
            header: "Description",
            widthPx: 280,
            minWidthPx: 200,
            fluid: true,
          },
          { id: "account", header: "Account", widthPx: 180, minWidthPx: 140 },
          { id: "qty", header: "Qty", align: "right", widthPx: 72, minWidthPx: 64 },
          {
            id: "price",
            header: `Price (${currency})`,
            align: "right",
            widthPx: 110,
            minWidthPx: 88,
          },
          {
            id: "discount",
            header: "Discount",
            align: "right",
            widthPx: 96,
            minWidthPx: 72,
          },
          { id: "tax", header: "Tax %", align: "right", widthPx: 80, minWidthPx: 64 },
          { id: "actions", header: "", widthPx: 48, minWidthPx: 40, resizable: false },
        ]}
        {...(lines.length < 200
          ? { onAddRow: () => onChange([...lines, emptyOrderLine()]) }
          : {})}
        addRowLabel="Add line"
      >
        {lines.map((line, index) => (
          <TableRow key={index}>
            <TableCell className="align-top p-0">
              <Textarea
                aria-label={`Line ${index + 1} description`}
                value={line.description}
                maxLength={2000}
                rows={1}
                className="lb-spreadsheet-wrap min-h-8"
                onChange={(e) => update(index, { description: e.target.value })}
              />
            </TableCell>
            <TableCell className="align-middle p-0">
              <AccountLookup
                ariaLabel={`Line ${index + 1} account`}
                companyId={companyId}
                accounts={accounts}
                value={line.accountId}
                onChange={(accountId) => update(index, { accountId })}
                placeholder="Select account"
                allowClear={false}
              />
            </TableCell>
            {(
              [
                ["quantity", `Line ${index + 1} quantity`],
                ["unitPrice", `Line ${index + 1} unit price`],
                ["discount", `Line ${index + 1} discount`],
                ["taxPercent", `Line ${index + 1} tax percent`],
              ] as const
            ).map(([field, ariaLabel]) => (
              <TableCell key={field} className="align-top p-0">
                <Input
                  data-order-entry-cell={`${index}-${field}`}
                  aria-label={ariaLabel}
                  inputMode="decimal"
                  className="text-right"
                  value={line[field]}
                  onChange={(e) => update(index, { [field]: e.target.value })}
                  onKeyDown={(e) => onNumericKeyDown(e, index, field)}
                  onPaste={(e) => onNumericPaste(e, index, field)}
                />
              </TableCell>
            ))}
            <TableCell className="align-middle p-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive"
                disabled={lines.length === 1}
                aria-label={`Remove line ${index + 1}`}
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </EditableLineItemGrid>
    </fieldset>
  );
}
