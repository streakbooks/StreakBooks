import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { listPayments } from "@/lib/purchases/purchases.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { ListSkeleton, ErrorState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { ListToolbar } from "@/components/common/ListTools";
import { useListSearch } from "@/hooks/use-list-search";
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

type PaymentRow = {
  id: string;
  payment_date: string;
  status: string;
  amount_minor: number;
  unallocated_minor: number;
  contacts: { name: string } | null;
};

export const Route = createFileRoute("/_authenticated/purchases/payments/")({
  head: () => ({ meta: [{ title: "Supplier payments — LinkBooks" }] }),
  component: PaymentsList,
});

function PaymentsList() {
  const { company } = useActiveCompany();
  const fmt = useFormat();
  const canPay = useCanDo("purchases.payment");
  const fetchPayments = useServerFn(listPayments);
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const query = useQuery({
    queryKey: ["payments", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchPayments({ data: { companyId: companyId! } }),
  });

  const rows = (query.data ?? []) as PaymentRow[];
  const list = useListSearch(
    rows,
    (p) => `${p.payment_date} ${p.contacts?.name ?? ""} ${p.status}`,
  );

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const newPayment = canPay ? (
    <Button size="sm" asChild>
      <Link to="/purchases/payments/new">New payment</Link>
    </Button>
  ) : undefined;

  return (
    <ListWorkspace
      title="Supplier payments"
      description="Full or partial payments allocated to authorised bills. Overpayments remain unallocated on the payment."
      actions={
        canPay ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/purchases/payments/batch">Batch payment</Link>
            </Button>
            {newPayment}
          </div>
        ) : undefined
      }
    >
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState
          onRetry={() => void query.refetch()}
          title="Could not load payments"
          description={friendlyAuthError(query.error)}
        />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          title="No payments"
          description={
            canPay ? "Record a payment against open bills." : "Supplier payments will appear here."
          }
          action={newPayment}
        />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            shown={list.filtered.length}
            total={rows.length}
            placeholder="Search payments"
            exportCsv={{
              company: company?.name ?? "",
              title: "Supplier payments",
              currency,
              headers: ["Date", "Supplier", "Status", "Amount", "Unallocated"],
              rows: list.filtered.map((r) => [
                r.payment_date,
                r.contacts?.name ?? "",
                r.status,
                fromMinorUnits(BigInt(r.amount_minor), currency),
                fromMinorUnits(BigInt(r.unallocated_minor), currency),
              ]),
            }}
          />
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Unallocated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to="/purchases/payments/$paymentId"
                        params={{ paymentId: p.id }}
                        className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {fmt.date(p.payment_date)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/purchases/payments/$paymentId"
                        params={{ paymentId: p.id }}
                        className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {p.contacts?.name ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/purchases/payments/$paymentId"
                        params={{ paymentId: p.id }}
                        className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <StatusBadge status={p.status} />
                      </Link>
                    </TableCell>
                    <TableCell className="money">
                      <Link
                        to="/purchases/payments/$paymentId"
                        params={{ paymentId: p.id }}
                        className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {fmt.money(p.amount_minor, currency)}
                      </Link>
                    </TableCell>
                    <TableCell className="money">
                      <Link
                        to="/purchases/payments/$paymentId"
                        params={{ paymentId: p.id }}
                        className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {fmt.money(p.unallocated_minor, currency)}
                      </Link>
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
