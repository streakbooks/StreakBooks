import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { listInvoices } from "@/lib/sales/sales.functions";
import { getSalesOverview } from "@/lib/sales/sales-statements.functions";
import { money } from "@/components/sales/sales-form-utils";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { StatCard } from "@/components/common/stat-card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/sales/")({
  head: () => ({
    meta: [
      { title: "Sales — LinkBooks" },
      { name: "description", content: "Customer invoices, receipts and credit notes." },
    ],
  }),
  component: SalesOverview,
});

function SalesOverview() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const fetchOverview = useServerFn(getSalesOverview);
  const fetchInvoices = useServerFn(listInvoices);

  const overviewQ = useQuery({
    queryKey: ["sales-overview", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchOverview({ data: { companyId: companyId! } }),
  });
  const invoicesQ = useQuery({
    queryKey: ["sales-invoices-recent", companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetchInvoices({
        data: { companyId: companyId!, page: 0, pageSize: 10, sort: "invoice_date", dir: "desc" },
      }),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <>
      <PageHeader
        title="Sales"
        description="Quotes, invoices, receipts and credit notes post through the shared ledger."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/imports" search={{ module: "sales" }}>
                Import invoices
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/contacts/new" search={{ kind: "customer" }}>
                New customer
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/sales/receipts/new">Record receipt</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/sales/invoices/new">New invoice</Link>
            </Button>
          </>
        }
      />

      {overviewQ.isPending ? (
        <LoadingState />
      ) : overviewQ.isError ? (
        <ErrorState
          title="Could not load overview"
          description={friendlyAuthError(overviewQ.error)}
          onRetry={() => overviewQ.refetch()}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Draft"
              value={String(overviewQ.data.draftCount)}
              hint="Draft invoices"
            />
          </div>
          {overviewQ.data.byCurrency.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices awaiting payment.</p>
          ) : (
            overviewQ.data.byCurrency.map((c) => (
              <div key={c.currency_code} className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="Awaiting payment"
                  value={money(c.awaitingMinor, c.currency_code)}
                  hint={c.currency_code}
                />
                <StatCard
                  label="Overdue"
                  value={money(c.overdueMinor, c.currency_code)}
                  hint={`${c.currency_code} · ${c.overdueCount} invoice${c.overdueCount === 1 ? "" : "s"}`}
                />
              </div>
            ))
          )}
        </div>
      )}

      {overviewQ.data && !overviewQ.isError && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-1 text-base font-semibold">Money coming in</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Open invoice balances due within 7 and 30 days, by original currency. Overdue invoices
              are excluded.
            </p>
            {overviewQ.data.byCurrency.length === 0 && (
              <p className="text-sm text-muted-foreground">No outstanding invoices.</p>
            )}
            {overviewQ.data.byCurrency.map((c) => (
              <div key={c.currency_code} className="mb-4 space-y-2 border-b pb-3 last:border-0">
                <p className="text-sm font-semibold">
                  {c.currency_code} · {c.openCount} open invoices
                </p>
                <div className="flex justify-between text-sm">
                  <span>Due in 7 days</span>
                  <strong>{money(c.dueNext7Minor, c.currency_code)}</strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Due in 30 days</span>
                  <strong>{money(c.dueNext30Minor, c.currency_code)}</strong>
                </div>
                {c.undatedMinor > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Due date missing</span>
                    <strong>{money(c.undatedMinor, c.currency_code)}</strong>
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" asChild>
              <Link to="/sales/invoices">View invoices</Link>
            </Button>
          </section>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-1 text-base font-semibold">Receivables aging</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Outstanding invoice balances grouped by days past due. Values are not
              currency-converted.
            </p>
            {overviewQ.data.byCurrency.length === 0 && (
              <p className="text-sm text-muted-foreground">No outstanding invoices.</p>
            )}
            {overviewQ.data.byCurrency.map((c) => (
              <div key={c.currency_code} className="mb-4 space-y-2 border-b pb-3 last:border-0">
                <p className="text-sm font-semibold">{c.currency_code}</p>
                {(
                  [
                    ["Current", c.awaitingMinor],
                    ["1–30 days overdue", c.aging1to30Minor],
                    ["31–60 days overdue", c.aging31to60Minor],
                    ["61–90 days overdue", c.aging61to90Minor],
                    ["Over 90 days overdue", c.agingOver90Minor],
                  ] as const
                ).map(([label, amount]) => (
                  <div key={label} className="flex justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <strong className="tabular-nums">{money(amount, c.currency_code)}</strong>
                  </div>
                ))}
              </div>
            ))}
            <Button variant="outline" size="sm" asChild>
              <Link to="/sales/invoices">Review receivables</Link>
            </Button>
          </section>
        </div>
      )}

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Recent invoices</h2>
      {invoicesQ.isPending ? (
        <LoadingState />
      ) : invoicesQ.isError ? (
        <ErrorState
          title="Could not load invoices"
          description={friendlyAuthError(invoicesQ.error)}
        />
      ) : (invoicesQ.data?.rows ?? []).length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create a customer invoice to start posting receivables."
          actionLabel="New invoice"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoicesQ.data!.rows.slice(0, 10).map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <Link
                    to="/sales/invoices/$invoiceId"
                    params={{ invoiceId: inv.id }}
                    className="underline-offset-2 hover:underline"
                  >
                    {inv.invoice_date}
                  </Link>
                </TableCell>
                <TableCell>{inv.contacts?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{inv.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {money(inv.total_minor, inv.currency_code)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
