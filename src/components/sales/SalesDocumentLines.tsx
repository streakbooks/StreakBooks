"use client";

import { type ClipboardEvent, type KeyboardEvent } from "react";
import { type SalesLineFormState, emptySalesLine } from "@/lib/sales/line-form-state";

import { useVoiceSession } from "@/components/ai-voice/voice-context";

import { fromMinorUnits } from "@/lib/accounting/money";
import { selectedUnitPriceMinor } from "@/lib/sales/price-list-draft";
import { type DraftTierPriceRule } from "@/lib/products/price-list-tiers";
import {
  resolveDraftDiscountedUnitPrice,
  type DraftDiscountRule,
} from "@/lib/products/price-list-discounts";
import { appliedPriceListSnapshot, withManualPricing } from "@/lib/products/price-list-provenance";
import { computeTaxLineRounded } from "@/lib/sales/line-math-rounded";
import type { TaxTreatment } from "@/lib/sales/line-helpers";
import type { SalesTaxCode } from "@/lib/sales/tax-codes";
import { bpsToPercentString, percentStringToBps } from "@/components/sales/sales-form-utils";
import { Button } from "@/components/ui/button";
import { VoiceInput as Input } from "@/components/ai-voice/voice-fields";
import { EntityCombobox, type EntityOption } from "@/components/common/EntityCombobox";
import { EditableLineItemGrid } from "@/components/common/EditableLineItemGrid";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AccountCreateForm,
  ProductCreateForm,
  TaxCodeCreateForm,
} from "@/components/lookup/create-forms";
import { useCan } from "@/hooks/use-can";
import { interpretLineGridKey } from "@/lib/ui/line-grid-keyboard";
import { parseLineGridClipboard } from "@/lib/ui/line-grid-paste";
import { Trash2 } from "lucide-react";

type ProductOption = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  sales_price_minor: number;
  income_account_id: string | null;
  sales_tax_rate_bps: number;
};

type AccountOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  lines: SalesLineFormState[];
  onChange: (lines: SalesLineFormState[]) => void;
  products: ProductOption[];
  /** Alternate item prices from the selected active price list. Never alters existing lines. */
  priceOverrides?: Readonly<Record<string, number>>;
  /** Quantity/date-effective list prices; applied only when choosing a product. */
  priceRules?: readonly DraftTierPriceRule[];
  discountRules?: readonly DraftDiscountRule[];
  pricingDate?: string;
  selectedPriceListId?: string;
  /** Block catalogue selection while an active price list is being loaded or has failed. */
  productSelectionDisabled?: boolean;
  /** Called when a new line receives a selected price-list amount. */
  onPriceListProductSelected?: () => void;
  accounts: AccountOption[];
  currency: string;
  treatment?: TaxTreatment;
  taxCodes?: SalesTaxCode[];
  toMinor: (display: string) => bigint | number;
  disabled?: boolean;
  companyId?: string;
  /** Organisation base currency, used when creating an account from the line. */
  baseCurrency?: string;
};

const NO_CODE = "__custom__";

export function SalesDocumentLines({
  lines,
  onChange,
  products,
  priceOverrides = {},
  priceRules = [],
  discountRules = [],
  pricingDate = "",
  selectedPriceListId = "",
  productSelectionDisabled = false,
  onPriceListProductSelected,
  accounts,
  currency,
  treatment = "exclusive",
  taxCodes = [],
  toMinor,
  disabled = false,
  companyId,
  baseCurrency,
}: Props) {
  const { can } = useCan();
  const voice = useVoiceSession();
  const canProduct = Boolean(companyId) && can("products.manage") && !disabled;
  const canAccount = Boolean(companyId) && can("accounts.manage") && !disabled;
  const canTax = Boolean(companyId) && can("tax.settings") && !disabled;
  const productOptions: EntityOption[] = products.map((p) => ({
    value: p.id,
    label: p.code ? `${p.code} — ${p.name}` : p.name,
    description:
      fromMinorUnits(selectedUnitPriceMinor(p.id, p.sales_price_minor, priceOverrides), currency) +
      (discountRules.some((rule) => rule.product_id === p.id)
        ? " (percentage rules: actual line price depends on quantity/date)"
        : priceRules.some((rule) => rule.product_id === p.id)
          ? " (quantity/date rules)"
          : Object.prototype.hasOwnProperty.call(priceOverrides, p.id)
            ? " (price list)"
            : ""),
    keywords: `${p.code ?? ""} ${p.description ?? ""}`,
  }));

  const accountOptions: EntityOption[] = accounts.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
    keywords: a.name,
  }));

  const taxOptions: EntityOption[] = [
    { value: NO_CODE, label: "No tax code (custom rate)" },
    ...taxCodes.map((c) => ({
      value: c.id,
      label: `${c.code} — ${c.name} (${bpsToPercentString(c.rate_bps)}%)`,
      keywords: `${c.code} ${c.name}`,
    })),
  ];
  const codeById = new Map(taxCodes.map((c) => [c.id, c]));

  const update = (idx: number, patch: Partial<SalesLineFormState>) => {
    const next = [...lines];
    next[idx] = withManualPricing(lines[idx]!, patch);
    onChange(next);
  };

  const numericCols = ["quantity", "unitPrice", "discount"] as const;

  const onNumericKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colKey: (typeof numericCols)[number],
  ) => {
    if (disabled) return;
    const colIndex = numericCols.indexOf(colKey);
    const action = interpretLineGridKey(event.key, {
      shiftKey: event.shiftKey,
      atLastRow: rowIndex === lines.length - 1,
      atLastCol: colIndex === numericCols.length - 1,
    });
    if (action.type === "none") return;
    if (action.type === "add-row") {
      event.preventDefault();
      voice?.clearField();
      onChange([...lines, emptySalesLine()]);
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
      document.querySelector<HTMLElement>(`[data-sales-cell="${nextRow}-${targetKey}"]`)?.focus();
    }
  };

  const onNumericPaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    colKey: (typeof numericCols)[number],
  ) => {
    if (disabled) return;
    const text = event.clipboardData.getData("text");
    const grid = parseLineGridClipboard(text);
    if (grid.length <= 1 && (grid[0]?.length ?? 0) <= 1) return;
    event.preventDefault();
    const startCol = numericCols.indexOf(colKey);
    const next = lines.map((line) => ({ ...line }));
    for (let r = 0; r < grid.length; r++) {
      const targetRow = rowIndex + r;
      while (next.length <= targetRow) next.push(emptySalesLine());
      const row = grid[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const key = numericCols[startCol + c];
        if (!key) break;
        next[targetRow] = withManualPricing(next[targetRow]!, { [key]: row[c] ?? "" });
      }
    }
    voice?.clearField();
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
    const selectedPrice = resolveDraftDiscountedUnitPrice(
      productId,
      p.sales_price_minor,
      lines[idx]?.quantity ?? "1",
      pricingDate,
      priceOverrides,
      priceRules,
      discountRules,
    );
    if (selectedPrice !== undefined) onPriceListProductSelected?.();
    update(idx, {
      productId,
      pricingTrace:
        selectedPrice !== undefined && selectedPriceListId
          ? appliedPriceListSnapshot({
              priceListId: selectedPriceListId,
              productId,
              currency,
              quantity: lines[idx]?.quantity ?? "1",
              documentDate: pricingDate,
              cataloguePriceMinor: p.sales_price_minor,
              fixedPrices: priceOverrides,
              tiers: priceRules,
              discounts: discountRules,
            })
          : null,
      description: p.description?.trim() || p.name,
      accountId: p.income_account_id ?? lines[idx]?.accountId ?? "",
      unitPrice: fromMinorUnits(selectedPrice ?? p.sales_price_minor, currency),
      taxRateBps: String(p.sales_tax_rate_bps ?? 0),
      taxCodeId: "",
    });
  };

  const effectiveBps = (l: SalesLineFormState): number => {
    const code = l.taxCodeId ? codeById.get(l.taxCodeId) : undefined;
    return code ? code.rate_bps : Number(l.taxRateBps || 0);
  };

  const preview = (() => {
    try {
      const computed = lines.map((l) =>
        computeTaxLineRounded({
          quantity: Number(l.quantity),
          unit_price_minor: Number(toMinor(l.unitPrice || "0")),
          discount_minor: Number(toMinor(l.discount || "0")),
          tax_rate_bps: effectiveBps(l),
          treatment,
        }),
      );
      return {
        subtotal: computed.reduce((s, c) => s + Number(c.net_minor), 0),
        tax: computed.reduce((s, c) => s + Number(c.tax_minor), 0),
        total: computed.reduce((s, c) => s + Number(c.gross_minor), 0),
      };
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-3">
      <EditableLineItemGrid
        aria-label="Sales document lines"
        columns={[
          { id: "item", header: "Item / description", widthClassName: "min-w-[14rem]" },
          { id: "account", header: "Account", widthClassName: "min-w-[10rem]" },
          { id: "qty", header: "Qty", align: "right", widthClassName: "w-24" },
          { id: "price", header: "Price", align: "right", widthClassName: "w-28" },
          { id: "discount", header: "Discount", align: "right", widthClassName: "w-28" },
          { id: "tax", header: "Tax", widthClassName: "min-w-[9rem]" },
          { id: "rate", header: "Rate %", align: "right", widthClassName: "w-20" },
          { id: "actions", header: "", widthClassName: "w-12" },
        ]}
        onAddRow={
          disabled
            ? undefined
            : () => {
                voice?.clearField();
                onChange([...lines, emptySalesLine()]);
              }
        }
        addRowLabel="Add line"
      >
        {lines.map((line, idx) => {
          const code = line.taxCodeId ? codeById.get(line.taxCodeId) : undefined;
          return (
            <TableRow key={idx}>
              <TableCell className="align-top">
                <div className="space-y-2 py-1">
                  <EntityCombobox
                    aria-label={`Line ${idx + 1} product`}
                    options={productOptions}
                    value={line.productId}
                    onChange={(v) => applyProduct(idx, v)}
                    placeholder="Optional catalogue item"
                    emptyText="No products — enter a free-text line"
                    disabled={disabled || productSelectionDisabled}
                    companyId={companyId}
                    canAddNew={canProduct}
                    createTitle="New product or service"
                    renderCreate={
                      canProduct
                        ? (ctx) => (
                            <ProductCreateForm
                              companyId={companyId!}
                              currency={currency}
                              ctx={ctx}
                            />
                          )
                        : undefined
                    }
                    onCreated={(option) =>
                      update(idx, {
                        productId: option.id,
                        description: option.description || option.name || option.label,
                        unitPrice: option.meta || line.unitPrice,
                      })
                    }
                  />
                  <Input
                    placeholder="Description"
                    voiceField={{
                      key: "description",
                      label: "Description",
                      aliases: [],
                      line: idx,
                      order: 100 + idx * 100 + 10,
                    }}
                    value={line.description}
                    disabled={disabled}
                    onChange={(e) => update(idx, { description: e.target.value })}
                  />
                </div>
              </TableCell>
              <TableCell className="align-top">
                <EntityCombobox
                  aria-label={`Line ${idx + 1} account`}
                  options={accountOptions}
                  voiceField={{
                    key: "accountId",
                    label: "Account",
                    aliases: ["revenue account", "expense account", "expense asset account"],
                    line: idx,
                    order: 100 + idx * 100 + 20,
                  }}
                  value={line.accountId}
                  onChange={(v) => update(idx, { accountId: v })}
                  placeholder="Account"
                  allowClear={false}
                  disabled={disabled}
                  companyId={companyId}
                  canAddNew={canAccount}
                  createTitle="New account"
                  renderCreate={
                    canAccount
                      ? (ctx) => (
                          <AccountCreateForm
                            companyId={companyId!}
                            currency={baseCurrency || currency}
                            initialKind="revenue"
                            ctx={ctx}
                          />
                        )
                      : undefined
                  }
                />
              </TableCell>
              <TableCell className="align-top">
                <Input
                  data-sales-cell={`${idx}-quantity`}
                  voiceField={{
                    key: "quantity",
                    label: "Quantity",
                    aliases: ["qty"],
                    line: idx,
                    order: 100 + idx * 100 + 30,
                  }}
                  value={line.quantity}
                  disabled={disabled}
                  onChange={(e) => update(idx, { quantity: e.target.value })}
                  onKeyDown={(e) => onNumericKeyDown(e, idx, "quantity")}
                  onPaste={(e) => onNumericPaste(e, idx, "quantity")}
                  inputMode="decimal"
                  className="text-right"
                />
              </TableCell>
              <TableCell className="align-top">
                <Input
                  data-sales-cell={`${idx}-unitPrice`}
                  voiceField={{
                    key: "unitPrice",
                    label: "Unit price",
                    aliases: ["price"],
                    line: idx,
                    order: 100 + idx * 100 + 40,
                  }}
                  value={line.unitPrice}
                  disabled={disabled}
                  onChange={(e) => update(idx, { unitPrice: e.target.value })}
                  onKeyDown={(e) => onNumericKeyDown(e, idx, "unitPrice")}
                  onPaste={(e) => onNumericPaste(e, idx, "unitPrice")}
                  inputMode="decimal"
                  className="text-right"
                />
              </TableCell>
              <TableCell className="align-top">
                <Input
                  data-sales-cell={`${idx}-discount`}
                  voiceField={{
                    key: "discount",
                    label: "Discount",
                    aliases: [],
                    line: idx,
                    order: 100 + idx * 100 + 50,
                  }}
                  value={line.discount}
                  disabled={disabled}
                  onChange={(e) => update(idx, { discount: e.target.value })}
                  onKeyDown={(e) => onNumericKeyDown(e, idx, "discount")}
                  onPaste={(e) => onNumericPaste(e, idx, "discount")}
                  inputMode="decimal"
                  className="text-right"
                />
              </TableCell>
              <TableCell className="align-top">
                <EntityCombobox
                  aria-label={`Line ${idx + 1} tax code`}
                  options={taxOptions}
                  voiceField={{
                    key: "taxCodeId",
                    label: "Tax",
                    aliases: ["tax rate", "tax code"],
                    line: idx,
                    order: 100 + idx * 100 + 60,
                  }}
                  value={line.taxCodeId || NO_CODE}
                  onChange={(v) => {
                    if (!v || v === NO_CODE) update(idx, { taxCodeId: "" });
                    else {
                      const c = codeById.get(v);
                      update(idx, { taxCodeId: v, taxRateBps: String(c?.rate_bps ?? 0) });
                    }
                  }}
                  placeholder="Tax code"
                  allowClear={false}
                  disabled={disabled}
                  companyId={companyId}
                  canAddNew={canTax}
                  createTitle="New tax code"
                  renderCreate={
                    canTax
                      ? (ctx) => (
                          <TaxCodeCreateForm companyId={companyId!} appliesTo="sales" ctx={ctx} />
                        )
                      : undefined
                  }
                  onCreated={(option) =>
                    update(idx, { taxCodeId: option.id, taxRateBps: option.meta ?? "0" })
                  }
                />
              </TableCell>
              <TableCell className="align-top">
                <Input
                  value={
                    code ? bpsToPercentString(code.rate_bps) : bpsToPercentString(line.taxRateBps)
                  }
                  disabled={disabled || Boolean(code)}
                  onChange={(e) =>
                    update(idx, { taxRateBps: String(percentStringToBps(e.target.value)) })
                  }
                  inputMode="decimal"
                  className="text-right"
                  title={code ? "Rate comes from the tax code" : "Custom rate in percent, e.g. 20"}
                />
              </TableCell>
              <TableCell className="align-top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove line ${idx + 1}`}
                  disabled={disabled || lines.length <= 1}
                  onClick={() => {
                    voice?.clearField();
                    onChange(lines.filter((_, i) => i !== idx));
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </EditableLineItemGrid>
      {preview ? (
        <p className="sr-only" aria-live="polite">
          Subtotal {currency} {fromMinorUnits(preview.subtotal, currency)}. Tax {currency}{" "}
          {fromMinorUnits(preview.tax, currency)}. Total {currency}{" "}
          {fromMinorUnits(preview.total, currency)}.
          {treatment === "inclusive" ? " Prices include tax." : " Prices exclude tax."}
        </p>
      ) : null}
    </div>
  );
}
