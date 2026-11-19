"use client";

import { useCallback, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { type PurchaseLineFormState, emptyPurchaseLine } from "@/lib/purchases/line-form-state";

import { useVoiceSession } from "@/components/ai-voice/voice-context";

import { isPurchaseTaxCode } from "@/lib/purchases/tax-code-eligibility";
import { Trash2, GripVertical } from "lucide-react";
import { fromMinorUnits } from "@/lib/accounting/money";
import { computeBillTotals, type TaxCalculationMode } from "@/lib/purchases/bill-form-helpers";
import { Button } from "@/components/ui/button";
import { VoiceInput as Input, VoiceTextarea } from "@/components/ai-voice/voice-fields";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityCombobox, type EntityOption } from "@/components/common/EntityCombobox";
import {
  EditableLineItemGrid,
  type EditableLineItemColumn,
} from "@/components/common/EditableLineItemGrid";
import { LineGridColumnMenu } from "@/components/common/LineGridColumnMenu";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AccountCreateForm,
  ContactCreateForm,
  ProductCreateForm,
  TaxCodeCreateForm,
} from "@/components/lookup/create-forms";
import { useCan } from "@/hooks/use-can";
import { interpretLineGridKey } from "@/lib/ui/line-grid-keyboard";
import { parseLineGridClipboard } from "@/lib/ui/line-grid-paste";
import {
  clampColumnWidth,
  DEFAULT_PURCHASE_LINE_COLUMN_WIDTHS,
  PURCHASE_LINE_COLUMN_OPTIONS,
  type PurchaseLineColumnKey,
} from "@/lib/ui/document-line-column-widths";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ProductOption = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  purchase_cost_minor: number;
  expense_account_id: string | null;
  purchase_tax_rate_bps: number;
};

type AccountOption = {
  id: string;
  code: string;
  name: string;
  account_type?: string;
};

type TaxCodeOption = {
  id: string;
  code: string;
  name: string;
  rateBps: number;
  appliesTo?: string;
};

type TrackingOption = { id: string; name: string; categoryId: string };
type CustomerOption = { id: string; name: string };

export type LineColumnKey = PurchaseLineColumnKey;

type Props = {
  lines: PurchaseLineFormState[];
  onChange: (lines: PurchaseLineFormState[]) => void;
  products: ProductOption[];
  accounts: AccountOption[];
  taxCodes?: TaxCodeOption[];
  classOptions?: TrackingOption[];
  locationOptions?: TrackingOption[];
  projectOptions?: TrackingOption[];
  customers?: CustomerOption[];
  currency: string;
  taxCalculation: TaxCalculationMode;
  toMinor: (display: string) => bigint | number;
  /** @deprecated Prefer onAddNewItem inside the item dropdown */
  onCreateItem?: () => void;
  onAddNewItem?: () => void;
  onAddNewAccount?: () => void;
  onAddNewTax?: () => void;
  onAddNewClass?: () => void;
  onAddNewLocation?: () => void;
  onAddNewCustomer?: () => void;
  onAddNewProject?: () => void;
  showClass?: boolean;
  showLocation?: boolean;
  showCustomer?: boolean;
  showProject?: boolean;
  showBillable?: boolean;
  showDiscount?: boolean;
  visibleColumns?: LineColumnKey[];
  onVisibleColumnsChange?: (next: LineColumnKey[]) => void;
  columnWidths?: Record<string, number>;
  onColumnWidthsChange?: (next: Record<string, number>) => void;
  baseCurrencyEquivalent?: string | null;
  companyId?: string;
  baseCurrency?: string;
};

const CELL_INPUT = "lb-spreadsheet-input h-8 rounded-none border-0 bg-transparent px-2 shadow-none";

function accountGroupLabel(type?: string): string {
  switch (type) {
    case "expense":
      return "EXPENSES";
    case "income":
      return "INCOME";
    case "asset":
      return "ASSETS";
    case "liability":
      return "LIABILITIES";
    case "equity":
      return "EQUITY";
    default:
      return "ACCOUNTS";
  }
}

export function PurchasesDocumentLines({
  lines,
  onChange,
  products,
  accounts,
  taxCodes = [],
  classOptions = [],
  locationOptions = [],
  projectOptions = [],
  customers = [],
  currency,
  taxCalculation,
  toMinor,
  onCreateItem,
  onAddNewItem,
  onAddNewAccount,
  onAddNewTax,
  onAddNewClass,
  onAddNewLocation,
  onAddNewCustomer,
  onAddNewProject,
  showClass = true,
  showLocation = true,
  showCustomer = false,
  showProject = false,
  showBillable = false,
  showDiscount = true,
  visibleColumns,
  onVisibleColumnsChange,
  columnWidths: columnWidthsProp,
  onColumnWidthsChange,
  baseCurrencyEquivalent,
  companyId,
  baseCurrency,
}: Props) {
  const { can } = useCan();
  const voice = useVoiceSession();
  const [localWidths, setLocalWidths] = useState<Record<string, number>>({
    ...DEFAULT_PURCHASE_LINE_COLUMN_WIDTHS,
  });
  const [localVisible, setLocalVisible] = useState<LineColumnKey[] | null>(null);
  const widths = columnWidthsProp ?? localWidths;
  const setWidths = useCallback(
    (next: Record<string, number>) => {
      if (onColumnWidthsChange) onColumnWidthsChange(next);
      else setLocalWidths(next);
    },
    [onColumnWidthsChange],
  );
  const effectiveVisible = visibleColumns ?? localVisible ?? undefined;
  const setVisible = useCallback(
    (next: LineColumnKey[]) => {
      if (onVisibleColumnsChange) onVisibleColumnsChange(next);
      else setLocalVisible(next);
    },
    [onVisibleColumnsChange],
  );
  const col = (key: LineColumnKey) => {
    if (effectiveVisible) return effectiveVisible.includes(key);
    if (key === "class") return showClass;
    if (key === "location") return showLocation;
    if (key === "customer") return showCustomer;
    if (key === "project") return showProject;
    if (key === "billable") return showBillable;
    if (key === "discount") return showDiscount;
    return true;
  };

  const w = (key: string) =>
    widths[key] ?? (DEFAULT_PURCHASE_LINE_COLUMN_WIDTHS as Record<string, number>)[key] ?? 100;

  const productOptions: EntityOption[] = products.map((p) => ({
    value: p.id,
    label: p.code ? `${p.code} — ${p.name}` : p.name,
    description: fromMinorUnits(p.purchase_cost_minor, currency),
    keywords: `${p.code ?? ""} ${p.description ?? ""}`,
  }));
  const accountOptions: EntityOption[] = accounts.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
    keywords: a.name,
    group: accountGroupLabel(a.account_type),
  }));
  const customerOptions: EntityOption[] = customers.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const addItem = onAddNewItem ?? onCreateItem;

  /** Numeric spreadsheet cells: qty → unit price → discount (when visible). */
  const numericCols = (
    [
      col("quantity") ? "quantity" : null,
      col("unitPrice") ? "unitPrice" : null,
      col("discount") ? "discount" : null,
    ] as const
  ).filter((key): key is "quantity" | "unitPrice" | "discount" => key !== null);

  const onNumericKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colKey: "quantity" | "unitPrice" | "discount",
  ) => {
    const colIndex = numericCols.indexOf(colKey);
    if (colIndex < 0) return;
    const action = interpretLineGridKey(event.key, {
      shiftKey: event.shiftKey,
      atLastRow: rowIndex === lines.length - 1,
      atLastCol: colIndex === numericCols.length - 1,
    });
    if (action.type === "none") return;
    if (action.type === "add-row") {
      event.preventDefault();
      voice?.clearField();
      onChange([...lines, emptyPurchaseLine()]);
      return;
    }
    if (
      action.type === "move" &&
      (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      const nextRow = Math.max(0, Math.min(lines.length - 1, rowIndex + action.rowDelta));
      const nextCol = Math.max(0, Math.min(numericCols.length - 1, colIndex + action.colDelta));
      const targetKey = numericCols[nextCol];
      if (!targetKey) return;
      const target = document.querySelector<HTMLElement>(
        `[data-purchase-cell="${nextRow}-${targetKey}"]`,
      );
      target?.focus();
    }
  };

  const onNumericPaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    colKey: "quantity" | "unitPrice" | "discount",
  ) => {
    const text = event.clipboardData.getData("text");
    const grid = parseLineGridClipboard(text);
    if (grid.length <= 1 && (grid[0]?.length ?? 0) <= 1) return;
    event.preventDefault();
    const startCol = numericCols.indexOf(colKey);
    if (startCol < 0) return;
    const next = lines.map((line) => ({ ...line }));
    for (let r = 0; r < grid.length; r++) {
      const targetRow = rowIndex + r;
      while (next.length <= targetRow) next.push(emptyPurchaseLine());
      const row = grid[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const key = numericCols[startCol + c];
        if (!key) break;
        next[targetRow] = { ...next[targetRow]!, [key]: row[c] ?? "" };
      }
    }
    voice?.clearField();
    onChange(next);
  };

  const update = (idx: number, patch: Partial<PurchaseLineFormState>) => {
    const next = [...lines];
    next[idx] = { ...lines[idx]!, ...patch };
    onChange(next);
  };

  const applyProduct = (idx: number, productId: string) => {
    if (!productId) {
      update(idx, { productId: "" });
      return;
    }
    const p = products.find((x) => x.id === productId);
    if (!p) {
      update(idx, { productId });
      return;
    }
    const cur = lines[idx]!;
    // Apply catalogue defaults only for empty / default fields — preserve manual overrides.
    update(idx, {
      productId,
      description: cur.description.trim() ? cur.description : p.description?.trim() || p.name,
      accountId: cur.accountId || p.expense_account_id || "",
      unitPrice:
        cur.unitPrice && cur.unitPrice !== "0.00"
          ? cur.unitPrice
          : fromMinorUnits(p.purchase_cost_minor, currency),
      taxRateBps:
        cur.taxRateBps && cur.taxRateBps !== "0"
          ? cur.taxRateBps
          : String(p.purchase_tax_rate_bps ?? 0),
    });
  };

  const applyTaxCode = (idx: number, taxCodeId: string) => {
    if (!taxCodeId) {
      update(idx, { taxCodeId: "" });
      return;
    }
    const code = taxCodes.find((t) => t.id === taxCodeId);
    update(idx, {
      taxCodeId,
      taxRateBps: code ? String(code.rateBps) : lines[idx]!.taxRateBps,
    });
  };

  const addMultiple = (n: number) => {
    voice?.clearField();
    onChange([...lines, ...Array.from({ length: n }, () => emptyPurchaseLine())]);
  };

  const onDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData("text/plain", String(idx));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    voice?.clearField();
    const fromIdx = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(fromIdx) || fromIdx === toIdx || fromIdx < 0 || fromIdx >= lines.length) {
      return;
    }
    const next = [...lines];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    onChange(next);
  };

  const preview = (() => {
    try {
      return computeBillTotals(
        lines.map((l) => ({
          quantity: Number(l.quantity),
          unitPriceMinor: Number(toMinor(l.unitPrice || "0")),
          discountMinor: Number(toMinor(l.discount || "0")),
          taxRateBps: Number(l.taxRateBps || 0),
        })),
        taxCalculation,
      );
    } catch {
      return null;
    }
  })();

  const purchaseTaxCodes = taxCodes.filter(isPurchaseTaxCode);

  const columnMenuIds = (effectiveVisible ??
    PURCHASE_LINE_COLUMN_OPTIONS.filter((option) => col(option.id)).map(
      (option) => option.id,
    )) as string[];

  const menuColumns = PURCHASE_LINE_COLUMN_OPTIONS.filter((option) => {
    if (option.id === "class") return showClass || Boolean(effectiveVisible);
    if (option.id === "location") return showLocation || Boolean(effectiveVisible);
    if (option.id === "customer") return showCustomer || Boolean(effectiveVisible);
    if (option.id === "project") return showProject || Boolean(effectiveVisible);
    if (option.id === "billable") return showBillable || Boolean(effectiveVisible);
    if (option.id === "discount") return showDiscount || Boolean(effectiveVisible);
    return true;
  });

  const gridColumns = [
    {
      id: "reorder",
      header: <span className="sr-only">Reorder</span>,
      widthPx: w("reorder"),
      minWidthPx: w("reorder"),
      resizable: false as const,
    },
    col("item")
      ? { id: "item", header: "Item / service", widthPx: w("item"), minWidthPx: w("item") }
      : null,
    col("description")
      ? {
          id: "description",
          header: "Description",
          widthPx: w("description"),
          minWidthPx: w("description"),
          fluid: true,
        }
      : null,
    col("quantity")
      ? {
          id: "quantity",
          header: "Qty",
          align: "right" as const,
          widthPx: w("quantity"),
          minWidthPx: w("quantity"),
        }
      : null,
    col("unitPrice")
      ? {
          id: "unitPrice",
          header: "Unit price",
          align: "right" as const,
          widthPx: w("unitPrice"),
          minWidthPx: w("unitPrice"),
        }
      : null,
    col("discount")
      ? {
          id: "discount",
          header: "Discount",
          align: "right" as const,
          widthPx: w("discount"),
          minWidthPx: w("discount"),
        }
      : null,
    col("account")
      ? {
          id: "account",
          header: "Expense / asset account",
          widthPx: w("account"),
          minWidthPx: w("account"),
        }
      : null,
    col("tax")
      ? { id: "tax", header: "Tax rate", widthPx: w("tax"), minWidthPx: w("tax") }
      : null,
    col("class")
      ? { id: "class", header: "Class", widthPx: w("class"), minWidthPx: w("class") }
      : null,
    col("location")
      ? { id: "location", header: "Location", widthPx: w("location"), minWidthPx: w("location") }
      : null,
    col("customer") || col("project")
      ? {
          id: "customer",
          header: "Customer / project",
          widthPx: w("customer"),
          minWidthPx: w("customer"),
        }
      : null,
    col("billable")
      ? {
          id: "billable",
          header: "Billable",
          align: "center" as const,
          widthPx: w("billable"),
          minWidthPx: w("billable"),
        }
      : null,
    col("amount")
      ? {
          id: "amount",
          header: "Amount",
          align: "right" as const,
          widthPx: w("amount"),
          minWidthPx: w("amount"),
          resizable: false as const,
        }
      : null,
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      widthPx: w("actions"),
      minWidthPx: w("actions"),
      resizable: false as const,
    },
  ].flatMap((column) => (column ? [column] : [])) as EditableLineItemColumn[];

  return (
    <div className="space-y-3" data-slot="purchases-document-lines">
      <EditableLineItemGrid
        aria-label="Purchase document lines"
        columns={gridColumns}
        onColumnWidthChange={(id, widthPx) =>
          setWidths({ ...widths, [id]: clampColumnWidth(widthPx) })
        }
        footerStart={
          <>
            <LineGridColumnMenu
              columns={menuColumns}
              visibleIds={columnMenuIds}
              onChange={(next) =>
                setVisible(
                  next.filter((id): id is LineColumnKey =>
                    PURCHASE_LINE_COLUMN_OPTIONS.some((option) => option.id === id),
                  ),
                )
              }
            />
            <Select
              onValueChange={(v) => {
                voice?.clearField();
                if (v === "1") onChange([...lines, emptyPurchaseLine()]);
                else if (v === "dup") {
                  const last = lines[lines.length - 1] ?? emptyPurchaseLine();
                  onChange([...lines, { ...last }]);
                } else addMultiple(Number(v));
              }}
            >
              <SelectTrigger className="h-8 w-[140px]" aria-label="Add lines">
                <SelectValue placeholder="Add lines" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Add 1</SelectItem>
                <SelectItem value="5">Add 5</SelectItem>
                <SelectItem value="10">Add 10</SelectItem>
                <SelectItem value="15">Add 15</SelectItem>
                <SelectItem value="20">Add 20</SelectItem>
                <SelectItem value="dup">Duplicate selected line</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        footer={
          preview ? (
            <TotalsSummary
              lines={[
                {
                  id: "subtotal",
                  label: "Subtotal",
                  value: fromMinorUnits(preview.subtotal_minor, currency),
                },
                {
                  id: "tax",
                  label: "Total tax",
                  value: fromMinorUnits(preview.tax_minor, currency),
                  emphasis: "muted",
                },
                {
                  id: "total",
                  label: "Total",
                  value: fromMinorUnits(preview.total_minor, currency),
                  emphasis: "total",
                },
                ...(baseCurrencyEquivalent
                  ? [
                      {
                        id: "base",
                        label: "Base-currency equivalent",
                        value: baseCurrencyEquivalent,
                        emphasis: "muted" as const,
                      },
                    ]
                  : []),
              ]}
            />
          ) : undefined
        }
      >
        {lines.map((line, idx) => {
                let lineAmount = "—";
                try {
                  const c = computeBillTotals(
                    [
                      {
                        quantity: Number(line.quantity),
                        unitPriceMinor: Number(toMinor(line.unitPrice || "0")),
                        discountMinor: Number(toMinor(line.discount || "0")),
                        taxRateBps: Number(line.taxRateBps || 0),
                      },
                    ],
                    taxCalculation,
                  );
                  lineAmount = fromMinorUnits(c.total_minor, currency);
                } catch {
                  /* invalid row */
                }
                return (
                  <TableRow
                    key={idx}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, idx)}
                  >
                    <TableCell className="p-0 align-middle">
                      <button
                        type="button"
                        className="cursor-grab p-1 text-muted-foreground"
                        draggable
                        onDragStart={(e) => onDragStart(e, idx)}
                        aria-label={`Drag to reorder line ${idx + 1}`}
                      >
                        <GripVertical className="size-4" />
                      </button>
                    </TableCell>
                    {col("item") ? (
                      <TableCell className="p-0 align-middle">
                        <EntityCombobox
                          aria-label={`Line ${idx + 1} product`}
                          options={productOptions}
                          value={line.productId}
                          onChange={(v) => applyProduct(idx, v)}
                          placeholder="Optional"
                          emptyText="No catalogue items"
                          onAddNew={addItem}
                          addNewLabel="+ Add new item or service…"
                          {...(companyId ? { companyId } : {})}
                          renderCreate={
                            companyId && !addItem && can("products.manage")
                              ? (ctx) => (
                                  <ProductCreateForm
                                    companyId={companyId}
                                    currency={currency}
                                    priceRole="purchase"
                                    ctx={ctx}
                                  />
                                )
                              : undefined
                          }
                          onCreated={
                            addItem
                              ? undefined
                              : (option) =>
                                  update(idx, {
                                    productId: option.id,
                                    description: line.description.trim()
                                      ? line.description
                                      : option.description || option.name || option.label,
                                    unitPrice:
                                      line.unitPrice && line.unitPrice !== "0.00"
                                        ? line.unitPrice
                                        : option.meta || line.unitPrice,
                                  })
                          }
                        />
                      </TableCell>
                    ) : null}
                    {col("description") ? (
                      <TableCell className="p-0 align-top">
                        <VoiceTextarea
                          aria-label={`Line ${idx + 1} description`}
                          voiceField={{
                            key: "description",
                            label: "Description",
                            aliases: [],
                            line: idx,
                            order: 100 + idx * 100 + 10,
                          }}
                          value={line.description}
                          onChange={(e) => update(idx, { description: e.target.value })}
                          placeholder="Description"
                          rows={1}
                          className="lb-spreadsheet-wrap min-h-8"
                        />
                      </TableCell>
                    ) : null}
                    {col("quantity") ? (
                      <TableCell className="p-0">
                        <Input
                          aria-label={`Line ${idx + 1} quantity`}
                          data-purchase-cell={`${idx}-quantity`}
                          voiceField={{
                            key: "quantity",
                            label: "Quantity",
                            aliases: ["qty"],
                            line: idx,
                            order: 100 + idx * 100 + 20,
                          }}
                          value={line.quantity}
                          onChange={(e) => update(idx, { quantity: e.target.value })}
                          onKeyDown={(e) => onNumericKeyDown(e, idx, "quantity")}
                          onPaste={(e) => onNumericPaste(e, idx, "quantity")}
                          inputMode="decimal"
                          className={cn(CELL_INPUT, "text-right tabular-nums")}
                        />
                      </TableCell>
                    ) : null}
                    {col("unitPrice") ? (
                      <TableCell className="p-0">
                        <Input
                          aria-label={`Line ${idx + 1} unit price`}
                          data-purchase-cell={`${idx}-unitPrice`}
                          voiceField={{
                            key: "unitPrice",
                            label: "Unit price",
                            aliases: ["price"],
                            line: idx,
                            order: 100 + idx * 100 + 30,
                          }}
                          value={line.unitPrice}
                          onChange={(e) => update(idx, { unitPrice: e.target.value })}
                          onKeyDown={(e) => onNumericKeyDown(e, idx, "unitPrice")}
                          onPaste={(e) => onNumericPaste(e, idx, "unitPrice")}
                          inputMode="decimal"
                          className={cn(CELL_INPUT, "text-right tabular-nums")}
                        />
                      </TableCell>
                    ) : null}
                    {col("discount") ? (
                      <TableCell className="p-0">
                        <Input
                          aria-label={`Line ${idx + 1} discount`}
                          data-purchase-cell={`${idx}-discount`}
                          voiceField={{
                            key: "discount",
                            label: "Discount",
                            aliases: [],
                            line: idx,
                            order: 100 + idx * 100 + 40,
                          }}
                          value={line.discount}
                          onChange={(e) => update(idx, { discount: e.target.value })}
                          onKeyDown={(e) => onNumericKeyDown(e, idx, "discount")}
                          onPaste={(e) => onNumericPaste(e, idx, "discount")}
                          inputMode="decimal"
                          className={cn(CELL_INPUT, "text-right tabular-nums")}
                        />
                      </TableCell>
                    ) : null}
                    {col("account") ? (
                      <TableCell className="p-0">
                        <EntityCombobox
                          aria-label={`Line ${idx + 1} account`}
                          options={accountOptions}
                          voiceField={{
                            key: "accountId",
                            label: "Account",
                            aliases: [
                              "revenue account",
                              "expense account",
                              "expense asset account",
                            ],
                            line: idx,
                            order: 100 + idx * 100 + 50,
                          }}
                          value={line.accountId}
                          onChange={(v) => update(idx, { accountId: v })}
                          placeholder="Account"
                          allowClear={false}
                          onAddNew={onAddNewAccount}
                          addNewLabel="+ Add new account…"
                          {...(companyId ? { companyId } : {})}
                          renderCreate={
                            companyId && !onAddNewAccount && can("accounts.manage")
                              ? (ctx) => (
                                  <AccountCreateForm
                                    companyId={companyId}
                                    currency={baseCurrency || currency}
                                    initialKind="expense"
                                    ctx={ctx}
                                  />
                                )
                              : undefined
                          }
                        />
                      </TableCell>
                    ) : null}
                    {col("tax") ? (
                      <TableCell className="p-0">
                        <EntityCombobox
                          aria-label={`Line ${idx + 1} tax rate`}
                          options={
                            taxCalculation === "none"
                              ? [{ value: "__none__", label: "No tax" }]
                              : [
                                  {
                                    value: "__bps__",
                                    label: `Manual (${(Number(line.taxRateBps || 0) / 100).toFixed(2)}%)`,
                                  },
                                  ...purchaseTaxCodes.map((t) => ({
                                    value: t.id,
                                    label: `${t.code} — ${(t.rateBps / 100).toFixed(2)}%`,
                                    keywords: t.name,
                                  })),
                                ]
                          }
                          voiceField={
                            taxCalculation === "none"
                              ? undefined
                              : {
                                  key: "taxCodeId",
                                  label: "Tax",
                                  aliases: ["tax rate", "tax code"],
                                  line: idx,
                                  order: 100 + idx * 100 + 60,
                                }
                          }
                          value={
                            taxCalculation === "none" ? "__none__" : line.taxCodeId || "__bps__"
                          }
                          onChange={(v) => {
                            if (v === "__bps__" || v === "__none__") update(idx, { taxCodeId: "" });
                            else applyTaxCode(idx, v);
                          }}
                          placeholder="Tax"
                          allowClear={false}
                          onAddNew={taxCalculation === "none" ? undefined : onAddNewTax}
                          addNewLabel="+ Add new tax rate…"
                          {...(companyId ? { companyId } : {})}
                          renderCreate={
                            companyId &&
                            taxCalculation !== "none" &&
                            !onAddNewTax &&
                            can("tax.settings")
                              ? (ctx) => (
                                  <TaxCodeCreateForm
                                    companyId={companyId}
                                    appliesTo="purchases"
                                    ctx={ctx}
                                  />
                                )
                              : undefined
                          }
                          onCreated={
                            onAddNewTax
                              ? undefined
                              : (option) =>
                                  update(idx, {
                                    taxCodeId: option.id,
                                    taxRateBps: option.meta ?? line.taxRateBps,
                                  })
                          }
                        />
                      </TableCell>
                    ) : null}
                    {col("class") ? (
                      <TableCell className="p-0">
                        <EntityCombobox
                          aria-label={`Line ${idx + 1} class`}
                          options={classOptions.map((o) => ({ value: o.id, label: o.name }))}
                          value={line.classOptionId}
                          onChange={(v) => update(idx, { classOptionId: v })}
                          placeholder="Class"
                          onAddNew={onAddNewClass}
                          addNewLabel="+ Add new class…"
                        />
                      </TableCell>
                    ) : null}
                    {col("location") ? (
                      <TableCell className="p-0">
                        <EntityCombobox
                          aria-label={`Line ${idx + 1} location`}
                          options={locationOptions.map((o) => ({ value: o.id, label: o.name }))}
                          value={line.locationOptionId}
                          onChange={(v) => update(idx, { locationOptionId: v })}
                          placeholder="Location"
                          onAddNew={onAddNewLocation}
                          addNewLabel="+ Add new location…"
                        />
                      </TableCell>
                    ) : null}
                    {col("customer") || col("project") ? (
                      <TableCell className="space-y-1 p-0">
                        {col("customer") ? (
                          <EntityCombobox
                            aria-label={`Line ${idx + 1} customer`}
                            options={customerOptions}
                            value={line.customerContactId}
                            onChange={(v) => update(idx, { customerContactId: v })}
                            placeholder="Customer"
                            onAddNew={onAddNewCustomer}
                            addNewLabel="+ Add new customer…"
                            {...(companyId ? { companyId } : {})}
                            renderCreate={
                              companyId && !onAddNewCustomer && can("contacts.manage")
                                ? (ctx) => (
                                    <ContactCreateForm
                                      companyId={companyId}
                                      kind="customer"
                                      ctx={ctx}
                                    />
                                  )
                                : undefined
                            }
                          />
                        ) : null}
                        {col("project") ? (
                          <EntityCombobox
                            aria-label={`Line ${idx + 1} project`}
                            options={projectOptions.map((o) => ({ value: o.id, label: o.name }))}
                            value={line.projectOptionId}
                            onChange={(v) => update(idx, { projectOptionId: v })}
                            placeholder="Project"
                            onAddNew={onAddNewProject}
                            addNewLabel="+ Add new project…"
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                    {col("billable") ? (
                      <TableCell className="p-2 text-center">
                        <Checkbox
                          checked={line.isBillable}
                          onCheckedChange={(c) => update(idx, { isBillable: Boolean(c) })}
                          aria-label={`Line ${idx + 1} billable`}
                        />
                      </TableCell>
                    ) : null}
                    {col("amount") ? (
                      <TableCell className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                        {lineAmount}
                      </TableCell>
                    ) : null}
                    <TableCell className="p-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        disabled={lines.length <= 1}
                        onClick={() => {
                          voice?.clearField();
                          onChange(lines.filter((_, i) => i !== idx));
                        }}
                        aria-label={`Delete line ${idx + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
      </EditableLineItemGrid>
    </div>
  );
}
