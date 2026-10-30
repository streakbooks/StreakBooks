import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CalendarClock, ClipboardCheck, FilePenLine, ArrowRight } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { getBillsWorkspaceSummary, getPurchasesOverview } from "@/lib/purchases/purchases.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { PageHeader, LoadingState, EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/purchases/")({
  head: () => ({ meta: [{ title: "Purchases — LinkBooks" }] }),
  component: PurchasesOverview,
});

function PurchasesOverview() {
  const { company, isPending } = useActiveCompany();
  const companyId = company?.id;
  const baseCurrency = company?.base_currency ?? "GBP";
  const fetchSummary = useServerFn(getBillsWorkspaceSummary);
  const fetchOverview = useServerFn(getPurchasesOverview);
  const summaryQ = useQuery({
    queryKey: ["bills-workspace-summary", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSummary({ data: { companyId: companyId! } }),
  });
  const overviewQ = useQuery({
    queryKey: ["purchases-overview", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchOverview({ data: { companyId: companyId! } }),
  });
  if (isPending || (companyId && (summaryQ.isPending || overviewQ.isPending))) return <LoadingState />;
  if (!companyId) return <EmptyState title="No organisation" description="Create an organisation first." />;
  if (summaryQ.isError || overviewQ.isError) {
    return <ErrorState description="Could not load purchasing information. Please try again." onRetry={() => { void summaryQ.refetch(); void overviewQ.refetch(); }} />;
  }
  const summary = summaryQ.data!;
  const overview = overviewQ.data!;
  const currencyGroups = overview.currencies;
  const preferred = currencyGroups.find((x) => x.currency === baseCurrency);
  const otherCurrencies = currencyGroups.filter((x) => x.currency !== baseCurrency);
  const money = (amount: number, currency: string) => `${fromMinorUnits(BigInt(amount), currency)} ${currency}`;
  const display = (amount: number) => money(amount, baseCurrency);
  const cards = [
    { label: "Outstanding bills", amount: preferred?.outstandingMinor ?? 0, hint: `${preferred?.openCount ?? 0} unpaid bills`, to: "/purchases/bills?tab=to_pay" },
    { label: "Overdue", amount: preferred?.overdueMinor ?? 0, hint: `${preferred?.overdueCount ?? 0} overdue bills`, to: "/purchases/bills?tab=to_pay&overdueOnly=true" },
    { label: "Due in 7 days", amount: preferred?.dueSoonMinor ?? 0, hint: `${preferred?.dueSoonCount ?? 0} upcoming bills`, to: `/purchases/bills?tab=to_pay&dateField=due_date&from=${overview.asOf}&to=${new Date(Date.parse(overview.asOf + "T00:00:00Z") + 7 * 86400000).toISOString().slice(0, 10)}` },
  ];
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Your supplier balances, upcoming payments and bills requiring attention."
        actions={<>
          <Button variant="outline" size="sm" asChild><Link to="/imports">Import</Link></Button>
          <Button variant="outline" size="sm" asChild><Link to="/contacts/new" search={{ kind: "supplier" }}>New supplier</Link></Button>
          
          <Button variant="outline" size="sm" asChild><Link to="/purchases/expenses/new">New expense</Link></Button>
          <Button size="sm" asChild><Link to="/purchases/bills/new">New bill</Link></Button>
        </>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <a key={card.label} href={card.to} className="block rounded-xl border bg-card p-5 shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{display(card.amount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
          </a>
        ))}
        <Link to="/purchases/bills" search={{ tab: "for_approval" }} className="block rounded-xl border bg-card p-5 shadow-sm transition-colors hover:bg-accent/40">
          <p className="text-sm text-muted-foreground">Awaiting approval</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{summary.counts.for_approval} bills</p>
          <p className="mt-1 text-xs text-muted-foreground">Ready for review</p>
        </Link>
      </div>
      {otherCurrencies.length > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-5">
            <p className="mb-2 text-sm font-medium">Additional currency balances (not converted)</p>
            <div className="flex flex-wrap gap-4 text-sm">
              {otherCurrencies.map((item) => <span key={item.currency}>{money(item.outstandingMinor, item.currency)} outstanding · {money(item.overdueMinor, item.currency)} overdue</span>)}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Action required</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Link to="/purchases/bills" search={{ tab: "to_pay", overdueOnly: true }} className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="flex-1 text-sm">Overdue supplier bills</span>
              <strong className="text-sm">{currencyGroups.reduce((sum, x) => sum + x.overdueCount, 0)}</strong><ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/purchases/bills" search={{ tab: "for_approval" }} className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50">
              <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-sm">Bills awaiting approval</span>
              <strong className="text-sm">{summary.counts.for_approval}</strong><ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/purchases/bills" search={{ tab: "drafts" }} className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50">
              <FilePenLine className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-sm">Draft bills to complete</span>
              <strong className="text-sm">{summary.counts.drafts}</strong><ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" /> Payment schedule</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {currencyGroups.length === 0 && <p className="text-sm text-muted-foreground">No outstanding supplier bills.</p>}
            {currencyGroups.map((item) => (
              <div key={item.currency} className="space-y-2">
                <p className="text-sm font-medium">{item.currency} · {money(item.outstandingMinor, item.currency)} outstanding</p>
                {([
                  ["Overdue", item.overdueMinor],
                  ["Next 7 days", item.dueSoonMinor],
                  ["Later", item.laterMinor],
                  ["No due date", item.undatedMinor],
                ] as const).map(([label, amount]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-muted-foreground"><span>{label}</span><span>{money(amount, item.currency)}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${item.outstandingMinor ? amount / item.outstandingMinor * 100 : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Upcoming supplier bills</CardTitle>
          <Button variant="outline" size="sm" asChild><Link to="/purchases/bills" search={{ tab: "to_pay" }}>View all</Link></Button>
        </CardHeader>
        <CardContent>
          {overview.upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No unpaid supplier bills to show.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b text-muted-foreground"><th className="py-3 font-medium">Supplier</th><th className="py-3 font-medium">Reference</th><th className="py-3 font-medium">Due date</th><th className="py-3 text-right font-medium">Balance due</th></tr></thead>
                <tbody>{overview.upcoming.map((bill) => (
                  <tr key={bill.id} className="border-b last:border-0">
                    <td className="py-3 font-medium"><Link to="/purchases/bills/$billId" params={{ billId: bill.id }} className="hover:underline">{bill.supplier}</Link></td>
                    <td className="py-3 text-muted-foreground">{bill.reference}</td>
                    <td className={`py-3 ${bill.overdue ? "font-medium text-destructive" : ""}`}>{bill.dueDate ?? "Not set"}{bill.overdue ? " · Overdue" : ""}</td>
                    <td className="py-3 text-right tabular-nums">{money(bill.outstandingMinor, bill.currency)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
