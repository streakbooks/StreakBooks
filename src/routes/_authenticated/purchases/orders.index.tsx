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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const fmt = useFormat();
  const navigate = useNavigate();
  const fetch = useServerFn(listPurchaseOrders);
  const convert = useServerFn(convertPurchaseOrderToBill);
  const queryClient = useQueryClient();
  const companyId = company?.id;
  const query = useQuery({
    queryKey: ["orders", companyId, search, status, page],
    enabled: Boolean(companyId),
    queryFn: () => fetch({ data: { companyId: companyId!, q: search, status, page } }),
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

  const rows = (query.data?.rows ?? []) as OrderRow[];
  const visible = rows;

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
        <ErrorState
          onRetry={() => void query.refetch()}
          title="Could not load orders"
          description={friendlyAuthError(query.error)}
        />
      ) : !query.data?.total && !search && status === "all" ? (
        <EmptyState title="No purchase orders" description="Create a PO for a supplier." />
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
