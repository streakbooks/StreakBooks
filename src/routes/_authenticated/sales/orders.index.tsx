import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { listSalesOrders, getSalesOrder, actSalesOrder } from "@/lib/sales/sales-orders.functions";
import { getSalesDocumentConfig } from "@/lib/sales/sales-config.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { EmptyState, LoadingState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { StatusBadge } from "@/components/common/stat-card";
import { SalesOrderForm } from "@/screens/sales/orders.new";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/sales/orders/")({
  validateSearch: (raw: Record<string, unknown>): { order?: string; create?: boolean } => {
    const order = typeof raw["order"] === "string" ? raw["order"] : undefined;
    const create =
      raw["create"] === true ||
      raw["create"] === "true" ||
      raw["create"] === "1" ||
      raw["create"] === 1;
    return {
      ...(order ? { order } : {}),
      ...(create ? { create: true } : {}),
    };
  },
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
  const { order: orderId, create: forceCreate } = Route.useSearch();
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
  const [editing, setEditing] = useState<"edit" | null>(null);
  const canDraft = can("sales.draft");

  // Legacy ?create=true → dedicated /sales/orders/new
  useEffect(() => {
    if (!forceCreate || !canDraft) return;
    void navigate({ to: "/sales/orders/new", replace: true });
  }, [forceCreate, canDraft, navigate]);

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

  if (editing === "edit" && detail.data) {
    return (
      <SalesOrderForm
        key={`edit:${orderId}`}
        companyId={companyId}
        currency={currency}
        initial={detail.data}
        title="Edit sales order"
        onSaved={(id) => open(id)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <ListWorkspace
      title="Sales orders"
      description="Agree customer orders, confirm them and convert to a draft invoice. Orders have no ledger impact."
      actions={
        canDraft ? (
          <Button size="sm" asChild>
            <Link to="/sales/orders/new">New sales order</Link>
          </Button>
        ) : null
      }
    >
      {orderId ? (
        detail.isPending ? (
          <LoadingState />
        ) : detail.isError ? (
          <QueryErrorState queries={[detail]} title="Could not load order" />
        ) : !detail.isSuccess ? (
          <LoadingState />
        ) : (
          <section className="mb-6 space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{detail.data.order_number}</h2>
              <StatusBadge status={detail.data.status} />
              <span>
                {detail.data.contacts?.name} · {fmt.date(detail.data.order_date)} ·{" "}
                {fmt.money(detail.data.total_minor, detail.data.currency_code)}{" "}
                {detail.data.currency_code}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              {can("sales.draft") && detail.data.status === "draft" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing("edit")}>
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
                  {cfg.isError ? (
                    <QueryErrorState
                      queries={[cfg]}
                      title="Could not load sales document settings"
                    />
                  ) : (
                    <>
                      <Label htmlFor="sales-order-invoice-date">Invoice date</Label>
                      <Input
                        id="sales-order-invoice-date"
                        className="w-auto"
                        type="date"
                        value={invoiceDate || cfg.data?.today || ""}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        disabled={cfg.isPending}
                      />
                      <Button
                        size="sm"
                        disabled={mutation.isPending || cfg.isPending || !cfg.data}
                        onClick={() => mutation.mutate("invoice")}
                      >
                        Create draft invoice
                      </Button>
                    </>
                  )}
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
            {(detail.data.lines ?? []).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.data.lines.map((line, index) => (
                    <TableRow key={`${line.description}-${index}`}>
                      <TableCell>{line.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.money(line.net_minor, detail.data.currency_code)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.money(line.tax_minor, detail.data.currency_code)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
            <TotalsSummary
              lines={[
                {
                  id: "subtotal",
                  label: "Subtotal",
                  value: fmt.money(detail.data.subtotal_minor, detail.data.currency_code),
                },
                {
                  id: "tax",
                  label: "Tax",
                  value: fmt.money(detail.data.tax_minor, detail.data.currency_code),
                },
                {
                  id: "total",
                  label: "Total",
                  value: fmt.money(detail.data.total_minor, detail.data.currency_code),
                  emphasis: "total",
                },
              ]}
            />
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
          <QueryErrorState queries={[q]} title="Could not load sales orders" />
        ) : !q.isSuccess ? (
          <LoadingState />
        ) : !q.data.total && !search && status === "all" ? (
          <EmptyState
            title="No sales orders"
            description="Create a customer order, then confirm and convert it to a draft invoice."
            action={
              canDraft ? (
                <Button size="sm" asChild>
                  <Link to="/sales/orders/new">New sales order</Link>
                </Button>
              ) : undefined
            }
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
    </ListWorkspace>
  );
}
