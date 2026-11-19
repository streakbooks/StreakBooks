import { PeriodClosePanel } from "@/components/accounting/PeriodClosePanel";
import { JournalsPanel } from "@/components/accounting/JournalsPanel";
import { PracticeWorkBoard } from "@/components/accountant/PracticeWorkBoard";
import { AccountWorkpapersPanel } from "@/components/accountant/AccountWorkpapersPanel";
import { useCanDo } from "@/hooks/use-can";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { getAccountantChecklist } from "@/lib/accountant/accountant.functions";
import {
  ACCOUNTANT_WORKSPACE_TABS,
  parseAccountantWorkspaceTab,
  type AccountantWorkspaceTab,
} from "@/lib/accountant/workspace-navigation";
import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { postTaxAdjustment } from "@/lib/tax/tax.functions";
import { toMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { AccountLookup } from "@/components/lookup";
import { LoadingState, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";

function parseChecklistDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

export const Route = createFileRoute("/_authenticated/accountant")({
  head: () => ({
    meta: [{ title: "Accountant tools — LinkBooks" }],
  }),
  validateSearch: (
    raw: Record<string, unknown>,
  ): { tab?: AccountantWorkspaceTab | undefined; asOf?: string | undefined } => ({
    tab: parseAccountantWorkspaceTab(raw["tab"]),
    asOf: parseChecklistDate(raw["asOf"]),
  }),
  component: AccountantPage,
});

function AccountantPage() {
  const { company } = useActiveCompany();
  return <AccountantTools key={company?.id ?? "none"} />;
}

function AccountantTools() {
  const search = Route.useSearch();
  const tab = search.tab ?? "overview";
  const navigate = useNavigate({ from: "/accountant" });
  const canAdjust = useCanDo("tax.settings");
  const { company, isPending } = useActiveCompany();
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const today = new Date().toISOString().slice(0, 10);
  const asOf = search.asOf ?? today;
  const qc = useQueryClient();
  const fetch = useServerFn(getAccountantChecklist);
  const fetchAccounts = useServerFn(listAccounts);
  const doAdjust = useServerFn(postTaxAdjustment);

  const query = useQuery({
    queryKey: ["accountant-checklist", companyId, asOf],
    enabled: Boolean(companyId) && tab === "overview",
    queryFn: () => fetch({ data: { companyId: companyId!, asOf } }),
  });
  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    enabled: Boolean(companyId) && tab === "tax-adjustments",
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });

  const [adjDate, setAdjDate] = useState(today);
  const [taxAcc, setTaxAcc] = useState("");
  const [offsetAcc, setOffsetAcc] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"increase_payable" | "decrease_payable">(
    "increase_payable",
  );
  const [adjKey, setAdjKey] = useState(`adj-${today}`);
  const [memo, setMemo] = useState("");

  const adjustM = useMutation({
    mutationFn: () =>
      doAdjust({
        data: {
          companyId: companyId!,
          journalDate: adjDate,
          taxAccountId: taxAcc,
          offsetAccountId: offsetAcc,
          amountMinor: Number(toMinorUnits(amount || "0", currency)),
          direction,
          adjustmentKey: adjKey,
          currencyCode: currency,
          memo,
        },
      }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["accountant-checklist", companyId] });
      toast.success(`Tax adjustment posted (journal ${r.journalId.slice(0, 8)}…)`);
      setAmount("");
      setMemo("");
      // Keep the reference stable for retries, but rotate it after a confirmed post.
      setAdjKey(`adj-${new Date().toISOString().slice(0, 10)}-${window.crypto.randomUUID()}`);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!companyId) {
    return (
      <EmptyState
        title="No organisation"
        description="Select a client organisation to review period-end readiness."
      />
    );
  }

  const accounts = (
    (accountsQ.data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      is_postable: boolean;
      is_active: boolean;
    }>
  ).filter((a) => a.is_active && a.is_postable);

  return (
    <ListWorkspace
      title="Accountant tools"
      description="A connected workspace for review queues, client work, journals, reconciliations, financial close and tax adjustments."
    >
      <Tabs value={tab}>
        <TabsList
          onKeyDown={handleNativeTabKeyDown}
          className="mb-6 flex h-auto flex-wrap justify-start gap-1"
          aria-label="Accountant tools sections"
        >
          {ACCOUNTANT_WORKSPACE_TABS.map((item) => (
            <Link
              key={item.id}
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={tab === item.id}
              data-state={tab === item.id ? "active" : "inactive"}
              to="/accountant"
              search={{ tab: item.id, asOf: search.asOf }}
              resetScroll={false}
            >
              {item.label}
            </Link>
          ))}
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Dated exception counts and the latest journal activity for the active organisation. Each
            review action opens its authoritative module.
          </p>
          <label className="mb-4 block max-w-xs text-sm">
            Review balances and queues through
            <Input
              aria-label="Checklist as of"
              type="date"
              value={asOf}
              onChange={(e) => {
                const nextDate = parseChecklistDate(e.target.value);
                if (nextDate)
                  void navigate({ search: { tab, asOf: nextDate }, resetScroll: false });
              }}
            />
          </label>
          {query.isPending ? (
            <LoadingState />
          ) : query.isError ? (
            <QueryErrorState queries={[query]} title="Could not load checklist" />
          ) : (
            <>
              <div
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                aria-label="Accountant review queue indicators"
              >
                <CheckCard
                  title="Unlocked periods"
                  count={query.data!.unlockedPeriods}
                  href="/accounting"
                />
                <CheckCard
                  title="Draft invoices"
                  count={query.data!.draftInvoices}
                  href="/sales/invoices"
                />
                <CheckCard
                  title="Draft / awaiting approval bills"
                  count={query.data!.draftBills}
                  href="/purchases/bills"
                />
                <CheckCard
                  title="Uncategorised bank"
                  count={query.data!.uncategorisedBank}
                  href="/banking/transactions"
                />
                <CheckCard
                  title="Matched, not reconciled"
                  count={query.data!.matchedAwaitingReconcile}
                  href="/banking/reconcile"
                />
                <CheckCard
                  title="Open recon sessions"
                  count={query.data!.openReconciliationSessions}
                  href="/banking/reconcile"
                />
              </div>

              <h2 className="mt-8 mb-3 border-b border-border/70 pb-2 text-base font-bold tracking-[-0.02em] text-foreground">
                Recent journals
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Memo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(
                    query.data!.recentJournals as Array<{
                      id: string;
                      journal_number: number;
                      journal_date: string;
                      status: string;
                      source_type: string;
                      memo: string | null;
                    }>
                  ).map((j) => (
                    <TableRow key={j.id}>
                      <TableCell>{j.journal_number}</TableCell>
                      <TableCell>{j.journal_date}</TableCell>
                      <TableCell>
                        <StatusBadge status={j.status} />
                      </TableCell>
                      <TableCell>{j.source_type}</TableCell>
                      <TableCell>{j.memo ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link to="/reports">Open reports</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/firm">Firm &amp; clients</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/tax">Tax configuration</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/accounting">Lock periods</Link>
                </Button>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="client-work">
          <PracticeWorkBoard key={companyId} companyId={companyId} />
        </TabsContent>
        <TabsContent value="workpapers">
          <AccountWorkpapersPanel companyId={companyId} currency={currency} />
        </TabsContent>
        <TabsContent value="journals" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/accounting/journals/new" search={{ mode: "post" }}>
                Create manual journal
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/recurring-journals">Recurring journals</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/accounting" search={{ tab: "corrections" }}>
                Transaction corrections
              </Link>
            </Button>
          </div>
          <JournalsPanel companyId={companyId} currency={currency} />
        </TabsContent>
        <TabsContent value="reconciliation" className="space-y-4">
          <h2 className="text-lg font-semibold">Reconciliation and transaction review</h2>
          <p className="text-sm text-muted-foreground">
            Review bank matches, unsettled transactions and accounting corrections in the existing
            controlled workflows. Reconciliation and posting actions remain subject to their own
            permissions and period locks.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/banking/reconcile">Bank reconciliation</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/banking/transactions">Review bank transactions</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/accounting" search={{ tab: "corrections" }}>
                Transaction corrections
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/accounting" search={{ tab: "health" }}>
                Ledger health
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/reports">Financial reports</Link>
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="period-close" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Review live close checks before any year-end posting or period lock. Existing
            server-side permissions remain authoritative.
          </p>
          <PeriodClosePanel key={companyId} companyId={companyId} />
        </TabsContent>
        <TabsContent value="tax-adjustments" className="space-y-4">
          {!canAdjust && (
            <Alert>
              <AlertDescription>
                You can review this workspace, but tax adjustment posting requires the tax settings
                permission.
              </AlertDescription>
            </Alert>
          )}
          {accountsQ.isError && (
            <QueryErrorState queries={[accountsQ]} title="Could not load posting accounts" />
          )}
          <h2 className="mt-8 mb-3 border-b border-border/70 pb-2 text-base font-bold tracking-[-0.02em] text-foreground">
            Tax adjustment (period-end)
          </h2>
          <Alert className="mb-3">
            <AlertDescription>
              Posts a single balanced <code>tax_adjustment</code> journal via the shared posting
              engine. Use a unique adjustment reference to prevent duplicate posting. This does not
              file a return.
            </AlertDescription>
          </Alert>
          <div className="mb-8 grid max-w-2xl gap-4 rounded-xl border border-border/85 bg-card p-5 shadow-card">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Adjustment reference</Label>
                <Input value={adjKey} onChange={(e) => setAdjKey(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tax control account</Label>
              <AccountLookup
                ariaLabel="Tax control account"
                accounts={accounts}
                value={taxAcc}
                onChange={setTaxAcc}
                companyId={companyId}
                placeholder="e.g. 2100 Tax Payable"
                allowClear={false}
              />
            </div>
            <div className="space-y-1">
              <Label>Offset account</Label>
              <AccountLookup
                ariaLabel="Offset account"
                accounts={accounts}
                value={offsetAcc}
                onChange={setOffsetAcc}
                companyId={companyId}
                placeholder="Expense / equity"
                allowClear={false}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label>Direction</Label>
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as typeof direction)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase_payable">Increase tax payable</SelectItem>
                    <SelectItem value="decrease_payable">Decrease tax payable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Memo</Label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            <Button
              size="sm"
              disabled={
                !canAdjust ||
                adjustM.isPending ||
                accountsQ.isPending ||
                !taxAcc ||
                !offsetAcc ||
                taxAcc === offsetAcc ||
                !(Number(amount) > 0) ||
                adjKey.trim().length < 4
              }
              onClick={() => {
                if (window.confirm("Post this tax adjustment to the active organisation’s ledger?"))
                  adjustM.mutate();
              }}
            >
              Post tax adjustment
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </ListWorkspace>
  );
}

function CheckCard({ title, count, href }: { title: string; count: number; href: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className="text-2xl font-semibold">{count}</span>
        <Button size="sm" variant="outline" asChild>
          <Link to={href}>Review</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
