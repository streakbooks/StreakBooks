import { parseChartBrowseSearch } from "@/lib/accounting/chart-browsing";
import { CashClassificationPanel } from "@/components/accounting/CashClassificationPanel";
import { useEffect, useRef } from "react";
import { type AccountingTab } from "@/lib/navigation/workspace-search";
import { pickJournalBrowseSearch } from "@/lib/accounting/journal-browsing";
import { DeferralsPanel } from "@/components/accounting/DeferralsPanel";
import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { TransactionCorrections } from "@/components/accounting/corrections/TransactionCorrections";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { ensureLedgerMasters } from "@/lib/accounting/accounting.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { ChartAccountsPanel } from "@/components/accounting/ChartAccountsPanel";
import { ConversionBalancesPanel } from "@/components/accounting/ConversionBalancesPanel";
import { FxPanel } from "@/components/accounting/FxPanel";
import { FinancialYearsPanel } from "@/components/accounting/FinancialYearsPanel";
import { IndustryCoaPanel } from "@/components/accounting/IndustryCoaPanel";
import { LedgerHealthPanel } from "@/components/accounting/LedgerHealthPanel";
import { ReconciliationExceptionCentre } from "@/components/accounting/ReconciliationExceptionCentre";
import { JournalsPanel } from "@/components/accounting/JournalsPanel";
import { PeriodClosePanel } from "@/components/accounting/PeriodClosePanel";

const accountingViews = [
  ["coa", "Chart of accounts"],
  ["journals", "Journals"],
  ["periods", "Financial years"],
  ["close", "Period close"],
  ["corrections", "Transaction corrections"],
  ["exceptions", "Reconciliation exceptions"],
  ["conversion", "Opening balances"],
  ["deferrals", "Prepayments & deferred income"],
  ["fx", "FX & reversals"],
  ["cash-classification", "Cash classification"],
  ["health", "Ledger health"],
  ["industry", "Industry library"],
] as const satisfies ReadonlyArray<readonly [AccountingTab, string]>;

const routeApi = getRouteApi("/_authenticated/accounting");

export function Accounting() {
  const { company, isPending } = useActiveCompany();
  if (isPending) return <LoadingState />;
  if (!company) {
    return (
      <EmptyState
        title="No organisation selected"
        description="Create or open an organisation to use the ledger."
      />
    );
  }
  return <AccountingWorkspace companyId={company.id} currency={company.base_currency} />;
}

export function AccountingWorkspace({
  companyId,
  currency,
}: {
  companyId: string;
  currency: string;
}) {
  const queryClient = useQueryClient();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const chartSearch = parseChartBrowseSearch(search);
  const canManageAccounts = useCanDo("accounts.manage");
  const canPostJournal = useCanDo("journals.manual");
  const tabsRef = useRef<HTMLDivElement>(null);
  const seedMasters = useServerFn(ensureLedgerMasters);
  const tab: AccountingTab = search.tab ?? (search.journal ? "journals" : "coa");
  const journalBrowseContext = pickJournalBrowseSearch(search);

  useEffect(() => {
    const list = tabsRef.current;
    const active = list?.querySelector('[aria-selected="true"]');
    if (!list || !active) return;
    const viewport = list.getBoundingClientRect();
    const bounds = active.getBoundingClientRect();
    if (bounds.left < viewport.left) list.scrollLeft -= viewport.left - bounds.left + 4;
    if (bounds.right > viewport.right) list.scrollLeft += bounds.right - viewport.right + 4;
  }, [tab]);

  const seedMutation = useMutation({
    mutationFn: () => seedMasters({ data: { companyId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["chart-accounts", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["periods", companyId] }),
      ]);
      toast.success("Chart of accounts and periods ready");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  return (
    <ListWorkspace
      title="Accounting"
      actions={
        <>
          {tab !== "journals" && canPostJournal ? (
            <Button size="sm" asChild>
              <Link to="/accounting/journals/new" search={{ mode: "post" }}>
                New manual journal
              </Link>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Accounting tools <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/recurring-journals">Recurring journals</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/reports">Reports</Link>
              </DropdownMenuItem>
              {canManageAccounts ? (
                <DropdownMenuItem
                  disabled={seedMutation.isPending}
                  onSelect={() => seedMutation.mutate()}
                >
                  {seedMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Set up accounts and periods
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <Tabs value={tab}>
        <TabsList
          ref={tabsRef}
          aria-label="Accounting views"
          onKeyDown={handleNativeTabKeyDown}
          className="flex w-full flex-nowrap"
        >
          {accountingViews.map(([view, label]) => (
            <Link
              key={view}
              id={`accounting-tab-${view}`}
              className={nativeTabLinkClass}
              role="tab"
              aria-controls={`accounting-panel-${view}`}
              aria-selected={tab === view}
              data-state={tab === view ? "active" : "inactive"}
              tabIndex={tab === view ? 0 : -1}
              to="/accounting"
              search={
                tab === view ? search : { ...chartSearch, ...journalBrowseContext, tab: view }
              }
              resetScroll={false}
            >
              {label}
            </Link>
          ))}
        </TabsList>

        <TabsContent
          value="deferrals"
          id="accounting-panel-deferrals"
          aria-labelledby="accounting-tab-deferrals"
        >
          <DeferralsPanel key={companyId} companyId={companyId} currency={currency} />
        </TabsContent>
        <TabsContent value="coa" id="accounting-panel-coa" aria-labelledby="accounting-tab-coa">
          <ChartAccountsPanel
            key={companyId}
            companyId={companyId}
            currency={currency}
            browsing={chartSearch}
            onBrowse={(patch) => {
              void navigate({
                search: (previous) => ({
                  ...previous,
                  ...parseChartBrowseSearch({ ...previous, ...patch }),
                  tab: "coa",
                }),
                replace: true,
                resetScroll: false,
              });
            }}
          />
        </TabsContent>

        <TabsContent
          value="industry"
          id="accounting-panel-industry"
          aria-labelledby="accounting-tab-industry"
        >
          <IndustryCoaPanel companyId={companyId} />
        </TabsContent>

        <TabsContent
          value="corrections"
          id="accounting-panel-corrections"
          aria-labelledby="accounting-tab-corrections"
        >
          <TransactionCorrections key={companyId} companyId={companyId} />
        </TabsContent>

        <TabsContent
          value="journals"
          id="accounting-panel-journals"
          aria-labelledby="accounting-tab-journals"
        >
          <JournalsPanel
            key={companyId}
            companyId={companyId}
            currency={currency}
            initialOpenJournalId={search.journal}
          />
        </TabsContent>

        <TabsContent
          value="periods"
          id="accounting-panel-periods"
          aria-labelledby="accounting-tab-periods"
        >
          <FinancialYearsPanel key={companyId} companyId={companyId} />
        </TabsContent>

        <TabsContent
          value="close"
          id="accounting-panel-close"
          aria-labelledby="accounting-tab-close"
        >
          <PeriodClosePanel key={companyId} companyId={companyId} initialPeriodId={search.period} />
        </TabsContent>

        <TabsContent
          value="exceptions"
          id="accounting-panel-exceptions"
          aria-labelledby="accounting-tab-exceptions"
        >
          <ReconciliationExceptionCentre key={companyId} companyId={companyId} />
        </TabsContent>

        <TabsContent
          value="health"
          id="accounting-panel-health"
          aria-labelledby="accounting-tab-health"
        >
          <LedgerHealthPanel key={companyId} companyId={companyId} />
        </TabsContent>

        <TabsContent
          value="conversion"
          id="accounting-panel-conversion"
          aria-labelledby="accounting-tab-conversion"
        >
          <ConversionBalancesPanel key={companyId} companyId={companyId} currency={currency} />
        </TabsContent>

        <TabsContent value="fx" id="accounting-panel-fx" aria-labelledby="accounting-tab-fx">
          <FxPanel key={companyId} companyId={companyId} currency={currency} />
        </TabsContent>
        <TabsContent
          value="cash-classification"
          id="accounting-panel-cash-classification"
          aria-labelledby="accounting-tab-cash-classification"
        >
          <CashClassificationPanel
            key={companyId}
            companyId={companyId}
            currency={currency}
            initialReview={search.cashReview}
          />
        </TabsContent>
      </Tabs>
    </ListWorkspace>
  );
}
