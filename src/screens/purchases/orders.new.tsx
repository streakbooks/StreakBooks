import type { PurchaseOrderDetail } from "@/lib/purchases/purchase-order-data";
import { fromMinorUnits } from "@/lib/accounting/money";
import { impliedDiscountMinor } from "@/lib/purchases/po-convert";
import { getPurchaseOrder } from "@/lib/purchases/purchases.functions";
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
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
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
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
  const nextKey = useRef(initial?.purchase_order_lines.length ?? 1);
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
      : [{ ...emptyOrderLine(), key: 0 }],
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
  const moveLine = (index: number, direction: number) =>
    setLines((current) => {
      const next = [...current];
      const moved = next.splice(index, 1)[0]!;
      next.splice(index + direction, 0, moved);
      return next;
    });
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
  const locked = mutation.isPending || Boolean(savedId);
  return (
    <ListWorkspace
      title={initial ? `Edit ${initial.order_number ?? "purchase order"}` : "New purchase order"}
      description="Agree supplier costs before billing. A purchase order does not affect the ledger."
    >
      {savedId ? (
        <div role="status" className="mb-4 rounded-md border p-4">
          <p>Purchase order saved.</p>
          <Link
            className="text-primary underline"
            to="/purchases/orders/$orderId"
            params={{ orderId: savedId }}
          >
            Open saved order
          </Link>
        </div>
      ) : null}
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-70">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="space-y-2">
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-date">Order date</Label>
            <Input
              id="order-date"
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </div>
        </div>
        <div className="max-w-sm space-y-2">
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
            Changing currency keeps the numeric prices. Review each line before saving.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Currency: <strong>{currency}</strong>. Prices exclude tax. Discounts are amounts in{" "}
          {currency} per line.
        </p>
        <div className="space-y-4" aria-label="Order lines">
          {lines.map((line, index) => (
            <section
              key={line.key}
              className="rounded-lg border p-4"
              aria-label={`Order line ${index + 1}`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">Line {index + 1}</h2>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => moveLine(index, -1)}
                    aria-label={`Move line ${index + 1} up`}
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === lines.length - 1}
                    onClick={() => moveLine(index, 1)}
                    aria-label={`Move line ${index + 1} down`}
                  >
                    Move down
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={lines.length >= 200}
                    onClick={() =>
                      setLines((current) => [...current, { ...line, key: nextKey.current++ }])
                    }
                  >
                    Duplicate line {index + 1}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                  >
                    Remove line {index + 1}
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`description-${line.key}`}>Description</Label>
                  <Input
                    id={`description-${line.key}`}
                    value={line.description}
                    maxLength={2000}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expense / asset account</Label>
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
                </div>
                {(
                  [
                    ["quantity", "Quantity"],
                    ["unitPrice", `Unit price (${currency})`],
                    ["discount", `Discount (${currency})`],
                    ["taxPercent", "Tax (%)"],
                  ] as const
                ).map(([field, label]) => (
                  <div className="space-y-2" key={field}>
                    <Label htmlFor={`${field}-${line.key}`}>{label}</Label>
                    <Input
                      id={`${field}-${line.key}`}
                      inputMode="decimal"
                      value={line[field]}
                      onChange={(e) => updateLine(line.key, { [field]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={lines.length >= 200}
          onClick={() =>
            setLines((current) => [...current, { ...emptyOrderLine(), key: nextKey.current++ }])
          }
        >
          Add line
        </Button>
        <div aria-live="polite" className="flex flex-wrap justify-end gap-6 text-sm">
          {validation.totals ? (
            <>
              <span>
                Subtotal <strong>{fmt.money(validation.totals.subtotal_minor, currency)}</strong>
              </span>
              <span>
                Tax <strong>{fmt.money(validation.totals.tax_minor, currency)}</strong>
              </span>
              <span>
                Total <strong>{fmt.money(validation.totals.total_minor, currency)}</strong>
              </span>
            </>
          ) : (
            <p className="text-muted-foreground">{validation.error}</p>
          )}
        </div>
        <div className="max-w-3xl space-y-2">
          <Label htmlFor="order-memo">Supplier instructions / memo</Label>
          <Textarea
            id="order-memo"
            maxLength={500}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
      </fieldset>
      <DocumentRecordPanel
        ref={recordRef}
        entityType="purchase_order"
        entityId={savedId ?? initial?.id ?? null}
        audience="supplier"
      />
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          disabled={locked || Boolean(validation.error) || !can("purchases.draft")}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Save order
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/purchases/orders">Back to orders</Link>
        </Button>
      </div>
    </ListWorkspace>
  );
}
