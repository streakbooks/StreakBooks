import { useState } from "react";
import { useCan } from "@/hooks/use-can";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFormat } from "@/hooks/use-format";
import { listPurchaseOrders } from "@/lib/purchases/purchases.functions";
import { ListSkeleton, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { ListToolbar } from "@/components/common/ListTools";

import { fromMinorUnits } from "@/lib/accounting/money";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/components/common/table-card";
import { StatusBadge } from "@/components/common/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrderRow = {
  id: string;
  order_number: string | null;
  currency_code: string;
  order_date: string;
  status: string;
  total_minor: number;
  billed_bill_id: string | null;
  contacts: { name: string } | null;
  approval_state?: string;
  supplier_reference?: string | null;
  expected_delivery_date?: string | null;
  acknowledged_on?: string | null;
  billable_quantity?: number;
};

export const Route = createFileRoute("/_authenticated/purchases/orders/")({
  component: OrdersList,
});

function OrdersList() {
  const { company } = useActiveCompany();
  const { can } = useCan();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const fmt = useFormat();
  const fetch = useServerFn(listPurchaseOrders);
  const companyId = company?.id;
  const query = useQuery({
    queryKey: ["orders", companyId, search, status, page],
    enabled: Boolean(companyId),
    queryFn: () => fetch({ data: { companyId: companyId!, q: search, status, page } }),
  });

  const rows = (query.data?.rows ?? []) as OrderRow[];
  const visible = rows;

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <ListWorkspace
      title="Purchase orders"
      description="Approve supplier commitments, track deliveries, receive goods and bill the quantities received."
      actions={
        can("purchases.draft") ? (
          <Button size="sm" asChild>
            <Link to="/purchases/orders/new">New order</Link>
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load orders" />
      ) : !query.isSuccess ? (
        <ListSkeleton />
      ) : !query.data?.total && !search && status === "all" ? (
        <EmptyState
          title="No purchase orders"
          description="Create a PO for a supplier."
          action={
            <Button size="sm" asChild>
              <Link to="/purchases/orders/new">New order</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-3 max-w-xs">
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Order status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* lookup-fixed-enum: Purchase-order lifecycle states are a short fixed schema enumeration. */}
                {[
                  ["all", "All statuses"],
                  ["draft", "Draft"],
                  ["pending", "Awaiting approval"],
                  ["approved", "Approved drafts"],
                  ["rejected", "Rejected drafts"],
                  ["late", "Late deliveries"],
                  ["sent", "Sent"],
                  ["partially_received", "Partially received"],
                  ["billed", "Billed"],
                  ["cancelled", "Cancelled"],
                ].map(([value, label]) => (
                  <SelectItem key={value} value={value!}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ListToolbar
            query={search}
            onQuery={(value) => {
              setSearch(value);
              setPage(1);
            }}
            shown={visible.length}
            total={query.data?.total ?? 0}
            placeholder="Search orders"
            exportCsv={{
              company: company?.name ?? "",
              title: "Purchase orders — current page",
              currency: "Per row",
              headers: [
                "Order",
                "Date",
                "Supplier",
                "Supplier reference",
                "Status",
                "Approval",
                "Expected delivery",
                "Acknowledged",
                "Currency",
                "Total",
              ],
              rows: visible.map((r) => [
                r.order_number ?? "",
                r.order_date,
                r.contacts?.name ?? "",
                r.supplier_reference ?? "",
                r.status,
                r.approval_state ?? "",
                r.expected_delivery_date ?? "",
                r.acknowledged_on ?? "",
                r.currency_code,
                fromMinorUnits(BigInt(r.total_minor), r.currency_code),
              ]),
            }}
          />
          <p className="mb-3 text-xs text-muted-foreground">
            Search and status filters cover all orders. CSV exports the current page.
          </p>
          <div className="mb-3 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} · {query.data?.total ?? 0} orders
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= (query.data?.total ?? 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No orders match these filters.
                    </TableCell>
                  </TableRow>
                ) : null}
                {visible.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        className="text-primary underline"
                        to="/purchases/orders/$orderId"
                        params={{ orderId: o.id }}
                      >
                        {o.order_number || "View order"}
                      </Link>
                    </TableCell>
                    <TableCell>{fmt.date(o.order_date)}</TableCell>
                    <TableCell>
                      {o.contacts?.name ?? "—"}
                      {o.supplier_reference ? (
                        <p className="text-xs text-muted-foreground">{o.supplier_reference}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>
                      {o.approval_state ? (
                        <StatusBadge
                          status={
                            o.approval_state === "pending" ? "awaiting_approval" : o.approval_state
                          }
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <span>
                        {o.expected_delivery_date
                          ? fmt.date(o.expected_delivery_date)
                          : "Not scheduled"}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {o.acknowledged_on
                          ? `Acknowledged ${fmt.date(o.acknowledged_on)}`
                          : "Awaiting acknowledgement"}
                      </p>
                    </TableCell>
                    <TableCell>{o.currency_code}</TableCell>
                    <TableCell className="money">
                      {fmt.money(o.total_minor, o.currency_code)}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/purchases/orders/$orderId" params={{ orderId: o.id }}>
                          {Number(o.billable_quantity ?? 0) > 0 && can("purchases.draft")
                            ? "Bill received goods"
                            : "Open order"}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </>
      )}
    </ListWorkspace>
  );
}
