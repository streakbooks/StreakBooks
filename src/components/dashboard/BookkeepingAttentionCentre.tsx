import { useMemo, type ReactNode } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { type DashboardAttentionFilter } from "@/lib/dashboard/attention-navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  FileClock,
  Landmark,
  ListTodo,
} from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import type { DashboardData } from "@/components/dashboard/DashboardWidgets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AttentionFilter = DashboardAttentionFilter;
const dashboardRoute = getRouteApi("/_authenticated/");
type AttentionRecord =
  | { kind: "document"; record: DashboardData["attention"]["items"][number] }
  | { kind: "bank"; record: DashboardData["attention"]["bank"][number] };

export function BookkeepingAttentionCentre({ data }: { data: DashboardData }) {
  const fmt = useFormat();
  const { attention } = dashboardRoute.useSearch();
  const filter: AttentionFilter = attention ?? "all";
  const alerts = data.attention;
  const approvalCount = alerts.access.purchases
    ? data.approvals.bills.reduce((total, row) => total + row.count, 0)
    : 0;
  const expenseCount = alerts.access.expenseApprovals
    ? data.approvals.expenseClaims.reduce((total, row) => total + row.count, 0)
    : 0;
  const overdueCount = alerts.overdueInvoices + alerts.overdueBills;
  const upcomingCount = alerts.dueSoonBills + alerts.dueSoonInvoices;
  const bankCount = alerts.access.banking ? data.tasks.uncategorisedBankLines : 0;
  const draftCount =
    (alerts.access.sales ? data.tasks.draftInvoices : 0) +
    (alerts.access.purchases ? data.tasks.draftBills : 0);
  const totalActions =
    overdueCount + upcomingCount + bankCount + approvalCount + expenseCount + draftCount;

  const visibleItems = useMemo(() => {
    const documents: AttentionRecord[] = alerts.items
      .filter(
        (item) =>
          filter === "all" ||
          (filter === "overdue" && item.daysUntilDue < 0) ||
          (filter === "upcoming" && item.daysUntilDue >= 0),
      )
      .map((record) => ({ kind: "document", record }));
    const bank: AttentionRecord[] =
      filter === "all" || filter === "bank"
        ? alerts.bank.map((record) => ({ kind: "bank", record }))
        : [];
    return filter === "bank" ? bank : [...documents, ...bank];
  }, [alerts.items, alerts.bank, filter]);

  const filters: Array<{ id: AttentionFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: totalActions },
    { id: "overdue", label: "Overdue", count: overdueCount },
    { id: "upcoming", label: "Due soon", count: upcomingCount },
    { id: "bank", label: "Bank review", count: bankCount },
  ];

  return (
    <section
      id="bookkeeping-attention"
      aria-label="Bookkeeping attention centre"
      className="space-y-4 scroll-mt-20"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ListTodo className="size-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold tracking-tight">Bookkeeping attention centre</h2>
            {totalActions > 0 ? (
              <Badge variant="warning">{fmt.number(totalActions)} items</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Real outstanding documents, review queues and approval counts, as at{" "}
            {fmt.date(data.asOf)}.
          </p>
        </div>
        {alerts.access.banking ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/banking/transactions" search={{ status: "uncategorised" }}>
              Review bank lines <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {alerts.access.sales ? (
          <AttentionSummary
            label="Overdue invoices"
            count={alerts.overdueInvoices}
            tone="urgent"
            description="Posted, unpaid customer invoices"
          >
            <Link to="/sales/invoices">
              View invoices <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </AttentionSummary>
        ) : null}
        {alerts.access.purchases ? (
          <AttentionSummary
            label="Overdue bills"
            count={alerts.overdueBills}
            tone="urgent"
            description="Posted, unpaid supplier bills"
          >
            <Link to="/purchases/bills" search={{ tab: "to_pay", overdueOnly: true }}>
              View overdue bills <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </AttentionSummary>
        ) : null}
        {alerts.access.sales || alerts.access.purchases ? (
          <AttentionSummary
            label="Due within 7 days"
            count={upcomingCount}
            tone="review"
            description="Posted receivables and payables"
          >
            {alerts.access.purchases ? (
              <Link to="/purchases/bills" search={{ tab: "to_pay" }}>
                View bills <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : (
              <Link to="/sales/invoices">
                View invoices <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </AttentionSummary>
        ) : null}
        {alerts.access.banking ? (
          <AttentionSummary
            label="Bank lines to review"
            count={bankCount}
            tone="review"
            description="Uncategorised imported transactions"
          >
            <Link to="/banking/transactions" search={{ status: "uncategorised" }}>
              Open Banking <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </AttentionSummary>
        ) : null}
      </div>

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Priority work queue</CardTitle>
              <CardDescription className="mt-1">
                Direct links to authorized company documents and transactions. Showing the first{" "}
                {visibleItems.length} records.
              </CardDescription>
            </div>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Filter bookkeeping tasks"
            >
              {filters.map((item) => (
                <Button
                  key={item.id}
                  variant={filter === item.id ? "secondary" : "ghost"}
                  size="sm"
                  asChild
                >
                  <Link
                    to="/"
                    search={{ attention: item.id }}
                    hash="bookkeeping-attention"
                    aria-current={filter === item.id ? "page" : undefined}
                  >
                    {item.label}{" "}
                    <span className="ml-1 text-xs tabular-nums">{fmt.number(item.count)}</span>
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleItems.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
              {(filters.find((item) => item.id === filter)?.count ?? 0) > 0
                ? "No matching records in this limited preview. Open the full workflow for the complete list."
                : "No records require attention in this view."}
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {visibleItems.map((item) => {
                if (item.kind === "bank") {
                  const bank = item.record;
                  return (
                    <li
                      key={"bank-" + bank.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-muted/30"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <Landmark
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{bank.description}</p>
                          <p className="text-xs text-muted-foreground">
                            Bank review · {bank.bankAccount} · {fmt.date(bank.txnDate)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="numeric text-sm font-medium">
                          {fmt.money(bank.amountMinor, bank.currency)}
                        </span>
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            to="/banking/transactions"
                            search={{ status: "uncategorised", transactionId: bank.id }}
                          >
                            Review <ArrowRight className="size-3.5" aria-hidden />
                          </Link>
                        </Button>
                      </div>
                    </li>
                  );
                }
                const record = item.record;
                const overdue = record.daysUntilDue < 0;
                const status = overdue
                  ? "Overdue " + fmt.number(-record.daysUntilDue) + "d"
                  : record.daysUntilDue === 0
                    ? "Due today"
                    : "Due in " + fmt.number(record.daysUntilDue) + "d";
                return (
                  <li
                    key={record.kind + "-" + record.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-muted/30"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {overdue ? (
                        <CircleAlert
                          className="mt-0.5 size-4 shrink-0 text-destructive"
                          aria-hidden
                        />
                      ) : (
                        <CalendarClock
                          className="mt-0.5 size-4 shrink-0 text-warning"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold">
                          {record.kind === "invoice" ? "Invoice " : "Bill "}
                          {record.reference}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {record.contact ?? (record.kind === "invoice" ? "Customer" : "Supplier")}{" "}
                          · Due {fmt.date(record.dueDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Badge variant={overdue ? "danger" : "warning"}>{status}</Badge>
                      <span className="numeric text-sm font-semibold">
                        {fmt.money(record.outstandingMinor, record.currency)}
                      </span>
                      <Button size="sm" variant="outline" asChild>
                        {record.kind === "invoice" ? (
                          <Link to="/sales/invoices/$invoiceId" params={{ invoiceId: record.id }}>
                            Open <ArrowRight className="size-3.5" aria-hidden />
                          </Link>
                        ) : (
                          <Link to="/purchases/bills/$billId" params={{ billId: record.id }}>
                            Open <ArrowRight className="size-3.5" aria-hidden />
                          </Link>
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Outstanding amounts are shown in each document currency. Counts refer to records, not
            summed currency values.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Other workflow tasks</CardTitle>
          <CardDescription>
            Continue in the existing, permission-controlled accounting workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {alerts.access.sales ? (
            <TaskLink
              icon={FileClock}
              label="Draft invoices"
              count={data.tasks.draftInvoices}
              to="/sales/invoices"
            />
          ) : null}
          {alerts.access.purchases ? (
            <TaskLink
              icon={FileClock}
              label="Draft bills"
              count={data.tasks.draftBills}
              to="/purchases/bills"
              tab="drafts"
            />
          ) : null}
          {alerts.access.purchases ? (
            <TaskLink
              icon={ListTodo}
              label="Bills awaiting approval"
              count={approvalCount}
              to="/purchases/bills"
              tab="for_approval"
            />
          ) : null}
          {alerts.access.expenseApprovals ? (
            <TaskLink
              icon={ListTodo}
              label="Expense claims for approval"
              count={expenseCount}
              to="/purchases/employee-expenses"
            />
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function AttentionSummary({
  label,
  count,
  tone,
  description,
  children,
}: {
  label: string;
  count: number;
  tone: "urgent" | "review";
  description: string;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-sm",
        count > 0 && tone === "urgent" && "border-destructive/35",
      )}
    >
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-3xl font-semibold tabular-nums",
            count > 0 && tone === "urgent" && "text-destructive",
          )}
        >
          {count}
        </p>
        <p className="min-h-8 text-xs text-muted-foreground">{description}</p>
        <div className="pt-1 text-xs font-semibold text-primary [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:hover:underline">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskLink({
  icon: Icon,
  label,
  count,
  to,
  tab,
}: {
  icon: typeof FileClock;
  label: string;
  count: number;
  to: "/sales/invoices" | "/purchases/bills" | "/purchases/employee-expenses";
  tab?: "drafts" | "for_approval";
}) {
  const content = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1 text-left text-xs">{label}</span>
      <Badge variant={count > 0 ? "warning" : "neutral"}>{count}</Badge>
      <ArrowRight className="size-3.5 shrink-0" aria-hidden />
    </>
  );
  return (
    <Button
      asChild
      variant="outline"
      className="h-auto min-h-14 justify-start gap-3 whitespace-normal px-3 py-2"
    >
      {to === "/purchases/bills" ? (
        <Link to="/purchases/bills" search={{ tab: tab ?? "all" }}>
          {content}
        </Link>
      ) : to === "/sales/invoices" ? (
        <Link to="/sales/invoices">{content}</Link>
      ) : (
        <Link to="/purchases/employee-expenses">{content}</Link>
      )}
    </Button>
  );
}
