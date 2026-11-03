import { useState } from "react";
import { useCan } from "@/hooks/use-can";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFormat } from "@/hooks/use-format";
import {
  convertPurchaseOrderToBill,
  listPurchaseOrders,
} from "@/lib/purchases/purchases.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PageHeader, ListSkeleton, ErrorState, EmptyState } from "@/components/common/states";
import { ListToolbar, useListSearch } from "@/components/common/ListTools";
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
};

export const Route = createFileRoute("/_authenticated/purchases/orders/")({
  component: OrdersList,
});

function OrdersList() {
  const { company } = useActiveCompany();
  const { can } = useCan();
  const [status, setStatus] = useState("all");
  const fmt = useFormat();
  const navigate = useNavigate();
  const fetch = useServerFn(listPurchaseOrders);
  const convert = useServerFn(convertPurchaseOrderToBill);
  const queryClient = useQueryClient();
  const companyId = company?.id;
  const query = useQuery({
    queryKey: ["orders", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetch({ data: { companyId: companyId! } }),
  });

  const convertMutation = useMutation({
    mutationFn: (orderId: string) => convert({ data: { companyId: companyId!, orderId } }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["orders", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["bills", companyId] });
      toast.success("Converted to draft bill (no ledger post until bill is authorised)");
      navigate({ to: "/purchases/bills/$billId", params: { billId: r.billId } });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const rows = (query.data ?? []) as OrderRow[];
  const list = useListSearch(
    rows,
    (o) =>
      `${o.order_number ?? ""} ${o.order_date} ${o.contacts?.name ?? ""} ${o.status} ${o.currency_code}`,
  );
  const visible = list.filtered.filter((o) => status === "all" || o.status === status);

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="POs never post AP or expense. Convert to a draft bill when ready — posting happens only when the bill is authorised."
        actions={
          can("purchases.draft") ? (
            <Button size="sm" asChild>
              <Link to="/purchases/orders/new">New order</Link>
            </Button>
          ) : null
        }
      />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState title="Could not load orders" description={friendlyAuthError(query.error)} />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState title="No purchase orders" description="Create a PO for a supplier." />
      ) : (
        <>
          <div className="mb-3 max-w-xs">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Order status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* lookup-fixed-enum: Purchase-order lifecycle states are a short fixed schema enumeration. */}
                {[
                  ["all", "All statuses"],
                  ["draft", "Draft"],
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
            query={list.query}
            onQuery={list.setQuery}
            shown={visible.length}
            total={rows.length}
            placeholder="Search orders"
            exportCsv={{
              company: company?.name ?? "",
              title: "Purchase orders",
              currency: "Per row",
              headers: ["Order", "Date", "Supplier", "Status", "Currency", "Total"],
              rows: visible.map((r) => [
                r.order_number ?? "",
                r.order_date,
                r.contacts?.name ?? "",
                r.status,
                r.currency_code,
                fromMinorUnits(BigInt(r.total_minor), r.currency_code),
              ]),
            }}
          />
          <p className="mb-3 text-xs text-muted-foreground">
            Showing up to the latest 100 orders. Search, filters and export apply to these loaded
            orders.
          </p>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
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
                    <TableCell>{o.contacts?.name ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>{o.currency_code}</TableCell>
                    <TableCell className="money">
                      {fmt.money(o.total_minor, o.currency_code)}
                    </TableCell>
                    <TableCell>
                      {!o.billed_bill_id && o.status !== "cancelled" && can("purchases.draft") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={convertMutation.isPending}
                          onClick={() => convertMutation.mutate(o.id)}
                        >
                          Convert to bill
                        </Button>
                      ) : o.billed_bill_id ? (
                        <Link
                          className="text-sm underline"
                          to="/purchases/bills/$billId"
                          params={{ billId: o.billed_bill_id }}
                        >
                          View bill
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </>
      )}
    </>
  );
}
