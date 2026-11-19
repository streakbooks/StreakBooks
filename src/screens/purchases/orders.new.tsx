import type { PurchaseOrderDetail } from "@/lib/purchases/purchase-order-data";
import { fromMinorUnits } from "@/lib/accounting/money";
import { impliedDiscountMinor } from "@/lib/purchases/po-convert";
import { getPurchaseOrder } from "@/lib/purchases/purchases.functions";
import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, GripVertical, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFormat } from "@/hooks/use-format";
import { getOrgExtendedSettings } from "@/lib/settings/org-settings.functions";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { listSuppliers, savePurchaseOrder } from "@/lib/purchases/purchases.functions";
import {
  emptyOrderLine,
  orderLinesFromForm,
  assertOrderDate,
  type PurchaseOrderLineForm,
} from "@/lib/purchases/purchase-order";
import { sumLines } from "@/lib/purchases/line-math";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/states";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { EditableLineItemGrid } from "@/components/common/EditableLineItemGrid";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DocumentRecordPanel,
  type DocumentRecordHandle,
} from "@/components/documents/DocumentRecordPanel";
import { AccountLookup, ContactLookup, LookupSelect } from "@/components/lookup";
import { AccountCreateForm, ContactCreateForm } from "@/components/lookup/create-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { interpretLineGridKey } from "@/lib/ui/line-grid-keyboard";
import { parseLineGridClipboard } from "@/lib/ui/line-grid-paste";

export function NewOrder({ initialEditId }: { initialEditId?: string | undefined } = {}) {
  const { company } = useActiveCompany();
  const edit = initialEditId;
  // Remount the draft when switching companies; never carry supplier/account IDs across tenants.
  return company ? (
    <OrderLoader
      key={`${company.id}:${edit ?? "new"}`}
      companyId={company.id}
      baseCurrency={company.base_currency}
      edit={edit}
    />
  ) : (
    <EmptyState title="No organisation" description="Select a company." />
  );
}

function OrderLoader({
  companyId,
  baseCurrency,
  edit,
}: {
  companyId: string;
  baseCurrency: string;
  edit: string | undefined;
}) {
  const fetch = useServerFn(getPurchaseOrder);
  const q = useQuery({
    queryKey: ["purchase-order", companyId, edit],
    enabled: Boolean(edit),
    queryFn: () => fetch({ data: { companyId, orderId: edit! } }),
  });
  if (edit && q.isPending) return <LoadingState />;
  if (edit && q.isError)
    return (
      <ErrorState
        onRetry={() => void q.refetch()}
        title="Could not load order"
        description={friendlyAuthError(q.error)}
      />
    );
  if (
    q.data &&
    (q.data.status !== "draft" ||
      q.data.billed_bill_id ||
      !["draft", "rejected"].includes(q.data.approval_state ?? ""))
  )
    return (
      <EmptyState
        title="Order cannot be edited"
        description="Return this order to draft before changing its items. Submitted or approved orders cannot be edited."
      />
    );
  return <OrderForm companyId={companyId} baseCurrency={baseCurrency} initial={q.data} />;
}
function OrderForm({
  companyId,
  baseCurrency,
  initial,
}: {
  companyId: string;
  baseCurrency: string;
  initial: PurchaseOrderDetail | undefined;
}) {
  const queryClient = useQueryClient();
  const fmt = useFormat();
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchAccounts = useServerFn(listAccounts);
  const save = useServerFn(savePurchaseOrder);
  const fetchOrg = useServerFn(getOrgExtendedSettings);
  const { can } = useCan();
  const [contactId, setContactId] = useState(initial?.contact_id ?? "");
  const [orderDate, setOrderDate] = useState(
    initial?.order_date ?? new Date().toISOString().slice(0, 10),
  );
  const [currencyOverride, setCurrencyOverride] = useState(initial?.currency_code.trim() ?? "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const nextKey = useRef(initial?.purchase_order_lines.length ?? 5);
  const [lines, setLines] = useState(() =>
    initial
      ? [...initial.purchase_order_lines]
          .sort((a, b) => a.line_no - b.line_no)
          .map((l, i) => ({
            key: i,
            ...emptyOrderLine(),
            description: l.description,
            accountId: l.account_id,
            quantity: String(l.quantity),
            unitPrice: fromMinorUnits(l.unit_price_minor, initial.currency_code),
            discount: fromMinorUnits(impliedDiscountMinor(l), initial.currency_code),
            taxPercent: String(l.tax_rate_bps / 100),
          }))
      : Array.from({ length: 5 }, (_, i) => ({ ...emptyOrderLine(), key: i })),
  );
  const [savedId, setSavedId] = useState<string | null>(null);
  const recordRef = useRef<DocumentRecordHandle>(null);
  const createdRef = useRef<string | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const orgQ = useQuery({
    queryKey: ["org-extended-settings", companyId],
    queryFn: () => fetchOrg({ data: { companyId } }),
  });
  const suppliersQ = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: () => fetchSuppliers({ data: { companyId } }),
  });
  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    queryFn: () => fetchAccounts({ data: { companyId } }),
  });
  const suppliers = (suppliersQ.data ?? []) as Array<{
    id: string;
    name: string;
    default_currency: string | null;
  }>;
  const currency = (
    currencyOverride ||
    (initial && contactId === initial.contact_id ? initial.currency_code : null) ||
    suppliers.find((s) => s.id === contactId)?.default_currency ||
    baseCurrency
  ).toUpperCase();
  const accounts = (
    (accountsQ.data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      is_postable: boolean;
      is_active: boolean;
    }>
  ).filter((a) => a.is_active && a.is_postable);
  const validation = (() => {
    try {
      assertOrderDate(orderDate);
      if (!contactId) throw new Error("Select a supplier");
      const parsed = orderLinesFromForm(lines, currency);
      return { totals: sumLines(parsed), error: null };
    } catch (error) {
      return {
        totals: null,
        error: error instanceof Error ? error.message : "Check the order lines",
      };
    }
  })();
  const mutation = useMutation({
    mutationFn: () => {
      if (createdRef.current) return Promise.resolve({ id: createdRef.current, orderNumber: "" });
      return save({
        data: {
          companyId,
          requestId: requestId.current,
          ...(initial ? { orderId: initial.id, version: initial.version } : {}),
          contactId,
          orderDate,
          currencyCode: currency,
          memo,
          lines: orderLinesFromForm(lines, currency),
        },
      });
    },
    onSuccess: async (result) => {
      createdRef.current = result.id;
      setSavedId(result.id);
      try {
        await recordRef.current?.flush(result.id);
      } catch (e) {
        toast.error(`Order saved, but notes or files could not be stored: ${friendlyAuthError(e)}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["orders", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["purchase-order", companyId, result.id] });
      toast.success("Purchase order saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const updateLine = (key: number, patch: Partial<PurchaseOrderLineForm>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const locked = mutation.isPending || Boolean(savedId);

  const ORDER_NUMERIC_COLS = ["quantity", "unitPrice", "discount", "taxPercent"] as const;

  const onOrderNumericKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colKey: (typeof ORDER_NUMERIC_COLS)[number],
  ) => {
    if (locked) return;
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
      setLines((current) => [...current, { ...emptyOrderLine(), key: nextKey.current++ }]);
      queueMicrotask(() => {
        document
          .querySelector<HTMLElement>(`[data-order-cell="${rowIndex + 1}-${colKey}"]`)
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
      document.querySelector<HTMLElement>(`[data-order-cell="${nextRow}-${colKey}"]`)?.focus();
    }
  };

  const onOrderNumericPaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    colKey: (typeof ORDER_NUMERIC_COLS)[number],
  ) => {
    if (locked) return;
    const grid = parseLineGridClipboard(event.clipboardData.getData("text"));
    if (grid.length <= 1 && (grid[0]?.length ?? 0) <= 1) return;
    event.preventDefault();
    const startCol = ORDER_NUMERIC_COLS.indexOf(colKey);
    if (startCol < 0) return;
    setLines((current) => {
      const next = current.map((line) => ({ ...line }));
      for (let r = 0; r < grid.length; r++) {
        const targetRow = rowIndex + r;
        while (next.length <= targetRow && next.length < 200) {
          next.push({ ...emptyOrderLine(), key: nextKey.current++ });
        }
        if (targetRow >= next.length) break;
        const cells = grid[r] ?? [];
        for (let c = 0; c < cells.length; c++) {
          const key = ORDER_NUMERIC_COLS[startCol + c];
          if (!key) break;
          next[targetRow] = { ...next[targetRow]!, [key]: cells[c] ?? "" };
        }
      }
      return next;
    });
  };

  const onDragStart = (event: DragEvent, index: number) => {
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (event: DragEvent, toIndex: number) => {
    event.preventDefault();
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    if (
      !Number.isInteger(fromIndex) ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= lines.length
    ) {
      return;
    }
    setLines((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      return next;
    });
  };
  if (suppliersQ.isPending || accountsQ.isPending || orgQ.isPending) return <LoadingState />;
  if (suppliersQ.isError || accountsQ.isError || orgQ.isError)
    return (
      <ErrorState
        title="Could not load order options"
        description={friendlyAuthError(suppliersQ.error ?? accountsQ.error ?? orgQ.error)}
        onRetry={() => {
          void suppliersQ.refetch();
          void accountsQ.refetch();
          void orgQ.refetch();
        }}
      />
    );
  const title = initial ? `Edit ${initial.order_number ?? "purchase order"}` : "New purchase order";
  return (
    <TransactionWorkspace
      title={title}
      description="Agree supplier costs before billing. A purchase order does not affect the ledger."
      breadcrumbs={[
        { label: "Purchases", to: "/purchases" },
        { label: "Purchase orders", to: "/purchases/orders" },
        { label: title },
      ]}
      meta={<StatusBadge status="draft" label={savedId ? "Saved draft" : "Draft"} />}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/purchases/orders">Back to orders</Link>
        </Button>
      }
      stickyActions={
        <Button
          size="sm"
          disabled={locked || Boolean(validation.error) || !can("purchases.draft")}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save order
        </Button>
      }
      details={
        <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
          {savedId ? (
            <div
              role="status"
              className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm"
            >
              <p>Purchase order saved.</p>
              <Link
                className="font-medium text-primary underline-offset-4 hover:underline"
                to="/purchases/orders/$orderId"
                params={{ orderId: savedId }}
              >
                Open saved order
              </Link>
            </div>
          ) : null}
          <FormGrid columns={4}>
            <FormControlShell width="contact">
              <Label>Supplier</Label>
              <ContactLookup
                ariaLabel="Supplier"
                contacts={suppliers.map((s) => ({ ...s, kind: "supplier" }))}
                value={contactId}
                onChange={setContactId}
                companyId={companyId}
                placeholder="Select supplier"
                allowClear={false}
                canCreate={can("contacts.manage")}
                createTitle="New supplier"
                renderCreate={
                  can("contacts.manage")
                    ? (ctx) => <ContactCreateForm companyId={companyId} kind="supplier" ctx={ctx} />
                    : undefined
                }
              />
            </FormControlShell>
            <FormControlShell width="date">
              <Label htmlFor="order-date">Order date</Label>
              <Input
                id="order-date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </FormControlShell>
            <FormControlShell width="currency">
              <Label>Order currency</Label>
              <LookupSelect
                ariaLabel="Order currency"
                value={currency}
                onChange={setCurrencyOverride}
                allowClear={false}
                options={[
                  ...new Set([baseCurrency, currency, ...(orgQ.data?.enabledCurrencies ?? [])]),
                ].map((code) => ({ id: code, label: code }))}
              />
              <p className="text-xs text-muted-foreground">
                Changing currency keeps numeric prices. Review each line before saving.
              </p>
            </FormControlShell>
          </FormGrid>
          <p className="text-sm text-muted-foreground">
            Currency <strong className="text-foreground">{currency}</strong>. Prices exclude tax.
            Discounts are amounts in {currency} per line.
          </p>
          <div className="space-y-2">
            <Label htmlFor="order-memo">Supplier instructions / memo</Label>
            <Textarea
              id="order-memo"
              maxLength={500}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
        </fieldset>
      }
      lines={
        <fieldset disabled={locked} className="disabled:opacity-70">
          <EditableLineItemGrid
            aria-label="Order lines"
            columns={[
              { id: "reorder", header: "", widthPx: 36, minWidthPx: 36, resizable: false },
              {
                id: "description",
                header: "Description",
                widthPx: 280,
                minWidthPx: 200,
                fluid: true,
              },
              { id: "account", header: "Account", widthPx: 180, minWidthPx: 140 },
              { id: "qty", header: "Qty", align: "right", widthPx: 72, minWidthPx: 64 },
              { id: "price", header: "Price", align: "right", widthPx: 100, minWidthPx: 80 },
              { id: "discount", header: "Discount", align: "right", widthPx: 96, minWidthPx: 72 },
              { id: "tax", header: "Tax %", align: "right", widthPx: 80, minWidthPx: 64 },
              { id: "actions", header: "", widthPx: 88, minWidthPx: 72, resizable: false },
            ]}
            {...(lines.length < 200
              ? {
                  onAddRow: () =>
                    setLines((current) => [
                      ...current,
                      { ...emptyOrderLine(), key: nextKey.current++ },
                    ]),
                }
              : {})}
            addRowLabel="Add line"
          >
            {lines.map((line, index) => (
              <TableRow
                key={line.key}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, index)}
              >
                <TableCell className="p-0 align-middle">
                  <button
                    type="button"
                    className="cursor-grab p-1 text-muted-foreground"
                    draggable={!locked}
                    onDragStart={(event) => onDragStart(event, index)}
                    aria-label={`Drag to reorder line ${index + 1}`}
                    disabled={locked}
                  >
                    <GripVertical className="size-4" aria-hidden />
                  </button>
                </TableCell>
                <TableCell className="align-top p-0">
                  <Textarea
                    id={`description-${line.key}`}
                    aria-label={`Line ${index + 1} description`}
                    value={line.description}
                    maxLength={2000}
                    rows={1}
                    className="lb-spreadsheet-wrap min-h-8"
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </TableCell>
                <TableCell className="align-top">
                  <AccountLookup
                    ariaLabel={`Line ${index + 1} account`}
                    accounts={accounts}
                    value={line.accountId}
                    onChange={(accountId) => updateLine(line.key, { accountId })}
                    companyId={companyId}
                    placeholder="Select account"
                    allowClear={false}
                    canCreate={can("accounts.manage")}
                    createTitle="New account"
                    renderCreate={
                      can("accounts.manage")
                        ? (ctx) => (
                            <AccountCreateForm
                              companyId={companyId}
                              currency={baseCurrency}
                              initialKind="expense"
                              ctx={ctx}
                            />
                          )
                        : undefined
                    }
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
                  <TableCell key={field} className="align-top">
                    <Input
                      id={`${field}-${line.key}`}
                      data-order-cell={`${index}-${field}`}
                      aria-label={ariaLabel}
                      inputMode="decimal"
                      className="text-right"
                      value={line[field]}
                      onChange={(e) => updateLine(line.key, { [field]: e.target.value })}
                      onKeyDown={(e) => onOrderNumericKeyDown(e, index, field)}
                      onPaste={(e) => onOrderNumericPaste(e, index, field)}
                    />
                  </TableCell>
                ))}
                <TableCell className="align-middle p-0">
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={locked || lines.length >= 200}
                      onClick={() =>
                        setLines((current) => [...current, { ...line, key: nextKey.current++ }])
                      }
                      aria-label={`Duplicate line ${index + 1}`}
                    >
                      <Copy className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      disabled={locked || lines.length === 1}
                      onClick={() =>
                        setLines((current) => current.filter((l) => l.key !== line.key))
                      }
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </EditableLineItemGrid>
        </fieldset>
      }
      totals={
        validation.totals ? (
          <TotalsSummary
            lines={[
              {
                id: "subtotal",
                label: "Subtotal",
                value: fmt.money(validation.totals.subtotal_minor, currency),
              },
              {
                id: "tax",
                label: "Tax",
                value: fmt.money(validation.totals.tax_minor, currency),
                emphasis: "muted",
              },
              {
                id: "total",
                label: "Total",
                value: fmt.money(validation.totals.total_minor, currency),
                emphasis: "total",
              },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            {validation.error}
          </p>
        )
      }
      support={
        <DocumentRecordPanel
          ref={recordRef}
          entityType="purchase_order"
          entityId={savedId ?? initial?.id ?? null}
          audience="supplier"
        />
      }
    />
  );
}
