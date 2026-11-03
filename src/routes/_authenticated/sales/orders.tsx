import { salesOrderLinesFromForm } from "@/lib/sales/sales-order-lines";
import { useState, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import {
  listSalesOrders,
  getSalesOrder,
  saveSalesOrder,
  actSalesOrder,
  type SalesOrder,
} from "@/lib/sales/sales-orders.functions";
import { getSalesDocumentConfig } from "@/lib/sales/sales-config.functions";
import { listCustomers } from "@/lib/sales/sales.functions";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import { emptyOrderLine } from "@/lib/purchases/purchase-order";
import { validateSalesLines, sumLines } from "@/lib/sales/line-helpers";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PageHeader, EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/stat-card";
import { ContactLookup } from "@/components/lookup";
import { OrderEntryLines } from "@/components/orders/OrderEntryLines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/sales/orders")({
  validateSearch: (raw: Record<string, unknown>): { order?: string } =>
    typeof raw["order"] === "string" ? { order: raw["order"] } : {},
  component: SalesOrders,
});
function SalesOrders() {
  const { company } = useActiveCompany();
  return company ? (
    <OrdersWorkspace key={company.id} companyId={company.id} currency={company.base_currency} />
  ) : (
    <EmptyState title="Select an organisation" description="Choose a company to manage orders." />
  );
}
function OrdersWorkspace({ companyId, currency }: { companyId: string; currency: string }) {
  const { order: orderId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const fmt = useFormat();
  const { can } = useCan();
  const qc = useQueryClient();
  const list = useServerFn(listSalesOrders),
    get = useServerFn(getSalesOrder),
    act = useServerFn(actSalesOrder),
    config = useServerFn(getSalesDocumentConfig);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const q = useQuery({
    queryKey: ["sales-orders", companyId, search, status, page],
    queryFn: () => list({ data: { companyId, q: search, status, page } }),
  });
  const detail = useQuery({
    queryKey: ["sales-order", companyId, orderId],
    enabled: Boolean(orderId),
    queryFn: () => get({ data: { companyId, orderId: orderId! } }),
  });
  const cfg = useQuery({
    queryKey: ["sales-document-config", companyId],
    queryFn: () => config({ data: { companyId } }),
  });
  const [invoiceDate, setInvoiceDate] = useState("");
  const mutation = useMutation({
    mutationFn: (action: "confirm" | "cancel" | "invoice") =>
      act({
        data: {
          companyId,
          orderId: orderId!,
          version: detail.data!.version,
          action,
          ...(action === "invoice" ? { invoiceDate: invoiceDate || cfg.data?.today || "" } : {}),
        },
      }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["sales-orders", companyId] });
      await qc.invalidateQueries({ queryKey: ["sales-order", companyId, orderId] });
      if (r.invoiceId) {
        await qc.invalidateQueries({ queryKey: ["sales-invoices", companyId] });
        toast.success("Draft invoice created");
      } else toast.success("Order updated");
    },
    onError: async (e) => {
      toast.error(friendlyAuthError(e));
      await detail.refetch();
    },
  });
  const open = (id: string) => {
    setEditing(null);
    void navigate({ search: { order: id } });
  };
  return (
    <>
      <PageHeader
        title="Sales orders"
        description="Agree customer orders, confirm them and convert to a draft invoice. Orders have no ledger impact."
        actions={
          can("sales.draft") ? (
            <Button
              size="sm"
              onClick={() => {
                void navigate({ search: {} });
                setEditing("new");
              }}
            >
              New sales order
            </Button>
          ) : null
        }
      />
      {editing ? (
        <SalesOrderForm
          key={`${editing}:${orderId ?? "new"}`}
          companyId={companyId}
          currency={currency}
          initial={editing === "edit" ? detail.data : undefined}
          onSaved={(id) => open(id)}
          onCancel={() => setEditing(null)}
        />
      ) : orderId ? (
        detail.isPending ? (
          <LoadingState />
        ) : detail.isError ? (
          <ErrorState title="Could not load order" description={friendlyAuthError(detail.error)} />
        ) : (
          <section className="mb-6 space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{detail.data.order_number}</h2>
              <StatusBadge status={detail.data.status} />
              <span>
                {detail.data.contacts?.name} · {fmt.date(detail.data.order_date)} ·{" "}
                {detail.data.currency_code}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.data.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell>{l.quantity}</TableCell>
                    <TableCell>{fmt.money(l.net_minor, detail.data.currency_code)}</TableCell>
                    <TableCell>{fmt.money(l.tax_minor, detail.data.currency_code)}</TableCell>
                    <TableCell>
                      {fmt.money(
                        BigInt(l.net_minor) + BigInt(l.tax_minor),
                        detail.data.currency_code,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-right font-semibold">
              Total: {fmt.money(detail.data.total_minor, detail.data.currency_code)}
            </p>
            {detail.data.memo ? <p className="whitespace-pre-wrap">{detail.data.memo}</p> : null}
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {can("sales.draft") && detail.data.status === "draft" ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing("edit")}>
                    Edit draft
                  </Button>
                  <Button
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate("confirm")}
                  >
                    Confirm order
                  </Button>
                </>
              ) : null}
              {can("sales.draft") && detail.data.status === "confirmed" ? (
                <>
                  <Label htmlFor="sales-order-invoice-date">Invoice date</Label>
                  <Input
                    id="sales-order-invoice-date"
                    className="w-auto"
                    type="date"
                    value={invoiceDate || cfg.data?.today || ""}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate("invoice")}
                  >
                    Create draft invoice
                  </Button>
                </>
              ) : null}
              {can("sales.draft") && ["draft", "confirmed"].includes(detail.data.status) ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancel this sales order? It will remain in your records and cannot be invoiced.",
                      )
                    )
                      mutation.mutate("cancel");
                  }}
                >
                  Cancel order
                </Button>
              ) : null}
              {detail.data.invoice_id ? (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/sales/invoices/$invoiceId"
                    params={{ invoiceId: detail.data.invoice_id }}
                  >
                    View invoice
                  </Link>
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                Print order
              </Button>
            </div>
          </section>
        )
      ) : null}
      <div className="print:hidden">
        <div className="mb-3 flex flex-wrap gap-3">
          <Input
            className="max-w-sm"
            aria-label="Search order number or memo"
            placeholder="Search order number or memo"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="rounded-md border bg-background p-2"
            aria-label="Sales order status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {/* lookup-fixed-enum: Fixed sales order lifecycle states. */}
            {["all", "draft", "confirmed", "invoiced", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {q.isPending ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState
            title="Could not load sales orders"
            description={friendlyAuthError(q.error)}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        className="text-primary underline"
                        to="/sales/orders"
                        search={{ order: o.id }}
                        onClick={() => setEditing(null)}
                      >
                        {o.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>{o.contacts?.name}</TableCell>
                    <TableCell>{fmt.date(o.order_date)}</TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>
                      {fmt.money(o.total_minor, o.currency_code)} {o.currency_code}
                    </TableCell>
                  </TableRow>
                ))}
                {!q.data.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={5}>No matching sales orders.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            <div className="mt-3 flex gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} · {q.data.total} orders
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * 25 >= q.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
function SalesOrderForm({
  companyId,
  currency: baseCurrency,
  initial,
  onSaved,
  onCancel,
}: {
  companyId: string;
  currency: string;
  initial: SalesOrder | undefined;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const fmt = useFormat();
  const { can } = useCan();
  const fetchCustomers = useServerFn(listCustomers),
    fetchAccounts = useServerFn(listAccounts),
    fetchConfig = useServerFn(getSalesDocumentConfig),
    save = useServerFn(saveSalesOrder);
  const customers = useQuery({
    queryKey: ["customers", companyId],
    queryFn: () => fetchCustomers({ data: { companyId } }),
  });
  const accounts = useQuery({
    queryKey: ["accounts", companyId],
    queryFn: () => fetchAccounts({ data: { companyId } }),
  });
  const config = useQuery({
    queryKey: ["sales-document-config", companyId],
    queryFn: () => fetchConfig({ data: { companyId } }),
  });
  const requestId = useRef(crypto.randomUUID());
  const [contactId, setContactId] = useState(initial?.contact_id ?? "");
  const [date, setDate] = useState(initial?.order_date ?? new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState(initial?.currency_code ?? baseCurrency);
  const [fx, setFx] = useState(String(initial?.fx_rate_to_base ?? 1));
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [lines, setLines] = useState(() =>
    initial
      ? initial.lines.map((l) => ({
          ...emptyOrderLine(),
          description: l.description,
          accountId: l.account_id,
          quantity: String(l.quantity),
          unitPrice: fromMinorUnits(l.unit_price_minor, initial.currency_code),
          discount: fromMinorUnits(l.discount_minor, initial.currency_code),
          taxPercent: String(l.tax_rate_bps / 100),
        }))
      : [emptyOrderLine()],
  );
  const parsed = () =>
    salesOrderLinesFromForm(lines, currency, config.data?.treatment ?? "exclusive");
  let total: string | null = null;
  try {
    total = fmt.money(sumLines(parsed()).total_minor, currency);
  } catch {
    /* Incomplete input is validated on submit. */
  }
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          requestId: requestId.current,
          contactId,
          orderDate: date,
          currencyCode: currency,
          fxRate: currency === baseCurrency ? 1 : Number(fx),
          memo,
          lines: parsed().map(
            ({ description, accountId, quantity, unitPriceMinor, discountMinor, taxRateBps }) => ({
              description,
              accountId,
              quantity,
              unitPriceMinor,
              discountMinor: discountMinor ?? 0,
              taxRateBps: taxRateBps ?? 0,
            }),
          ),
          ...(initial ? { orderId: initial.id, version: initial.version } : {}),
        },
      }),
    onSuccess: (r) => {
      toast.success("Sales order saved");
      onSaved(r.id);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  if (customers.isPending || accounts.isPending || config.isPending) return <LoadingState />;
  if (customers.isError || accounts.isError || config.isError)
    return (
      <ErrorState
        title="Could not load order options"
        description={friendlyAuthError(customers.error ?? accounts.error ?? config.error)}
      />
    );
  return (
    <fieldset disabled={mutation.isPending} className="mb-6 space-y-4 rounded-lg border p-4">
      <h2 className="font-semibold">{initial ? "Edit draft sales order" : "New sales order"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Customer</Label>
          <ContactLookup
            ariaLabel="Sales order customer"
            companyId={companyId}
            contacts={customers.data ?? []}
            value={contactId}
            onChange={setContactId}
            allowClear={false}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sales-order-date">Order date</Label>
          <Input
            id="sales-order-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sales-order-currency">Currency</Label>
          <Input
            id="sales-order-currency"
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </div>
        {currency !== baseCurrency ? (
          <div className="space-y-2">
            <Label htmlFor="sales-order-fx">Exchange rate to {baseCurrency}</Label>
            <Input
              id="sales-order-fx"
              inputMode="decimal"
              value={fx}
              onChange={(e) => setFx(e.target.value)}
            />
          </div>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Prices {config.data.treatment === "inclusive" ? "include" : "exclude"} tax, using the
        organisation's current sales tax treatment.
      </p>
      <OrderEntryLines
        lines={lines}
        onChange={setLines}
        accounts={(accounts.data ?? []).filter((a) => a.is_active && a.is_postable)}
        companyId={companyId}
        currency={currency}
      />
      <p className="text-right font-semibold">Total: {total ?? "Complete valid lines"}</p>
      <Label htmlFor="sales-order-memo">Memo</Label>
      <Textarea
        id="sales-order-memo"
        value={memo}
        maxLength={500}
        onChange={(e) => setMemo(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={mutation.isPending || !can("sales.draft") || !contactId || !total}
          onClick={() => mutation.mutate()}
        >
          Save draft
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel editing
        </Button>
      </div>
    </fieldset>
  );
}
