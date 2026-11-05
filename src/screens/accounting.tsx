import { getRouteApi } from "@tanstack/react-router";
import { type AccountingTab } from "@/lib/navigation/workspace-search";
import { DeferralsPanel } from "@/components/accounting/DeferralsPanel";
import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { TransactionCorrections } from "@/components/accounting/corrections/TransactionCorrections";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { ensureLedgerMasters } from "@/lib/accounting/accounting.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PageHeader, EmptyState, LoadingState } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { ChartAccountsPanel } from "@/components/accounting/ChartAccountsPanel";
import { ConversionBalancesPanel } from "@/components/accounting/ConversionBalancesPanel";
import { FxPanel } from "@/components/accounting/FxPanel";
import { FinancialYearsPanel } from "@/components/accounting/FinancialYearsPanel";
import { IndustryCoaPanel } from "@/components/accounting/IndustryCoaPanel";
import { LedgerHealthPanel } from "@/components/accounting/LedgerHealthPanel";
import { JournalsPanel } from "@/components/accounting/JournalsPanel";
import { PeriodClosePanel } from "@/components/accounting/PeriodClosePanel";

import { ManualJournalPanel } from "@/components/create-new/JournalPanels";
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
  const seedMasters = useServerFn(ensureLedgerMasters);
  const tab: AccountingTab = search.tab ?? (search.journal ? "journals" : "coa");

  const seedMutation = useMutation({
    mutationFn: () => seedMasters({ data: { companyId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["periods", companyId] });
      toast.success("Chart of accounts and periods ready");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  return (
    <>
      <PageHeader
        title="Accounting"
        description="Authoritative double-entry ledger: chart of accounts, journals, financial years and period close."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/recurring-journals">Recurring journals</Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={seedMutation.isPending}
              onClick={() => seedMutation.mutate()}
            >
              {seedMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Ensure CoA & periods
            </Button>
          </div>
        }
      />

      <Alert className="mb-6">
        <AlertTitle>Single posting engine</AlertTitle>
        <AlertDescription>
          All posts go through the server/database <code>post_journal</code> RPC (balanced minor
          units, period locks, idempotency). Posted history is immutable — correct via reversal.
        </AlertDescription>
      </Alert>

      <Tabs value={tab}>
        <TabsList onKeyDown={handleNativeTabKeyDown} className="flex-wrap">
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "coa"}
            data-state={tab === "coa" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "coa" }}
            resetScroll={false}
          >
            Chart of accounts
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "industry"}
            data-state={tab === "industry" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "industry" }}
            resetScroll={false}
          >
            Industry library
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "corrections"}
            data-state={tab === "corrections" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "corrections" }}
            resetScroll={false}
          >
            Transaction corrections
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "journals"}
            data-state={tab === "journals" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "journals" }}
            resetScroll={false}
          >
            Journals
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "post"}
            data-state={tab === "post" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "post" }}
            resetScroll={false}
          >
            Post manual journal
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "periods"}
            data-state={tab === "periods" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "periods" }}
            resetScroll={false}
          >
            Financial years
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "close"}
            data-state={tab === "close" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "close" }}
            resetScroll={false}
          >
            Period close
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "health"}
            data-state={tab === "health" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "health" }}
            resetScroll={false}
          >
            Ledger health
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "conversion"}
            data-state={tab === "conversion" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "conversion" }}
            resetScroll={false}
          >
            Opening balances
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "fx"}
            data-state={tab === "fx" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "fx" }}
            resetScroll={false}
          >
            FX &amp; reversals
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "deferrals"}
            data-state={tab === "deferrals" ? "active" : "inactive"}
            to="/accounting"
            search={{ tab: "deferrals" }}
            resetScroll={false}
          >
            Prepayments & deferred income
          </Link>
        </TabsList>

        <TabsContent value="deferrals" className="mt-4">
          <DeferralsPanel key={companyId} companyId={companyId} currency={currency} />
        </TabsContent>
        <TabsContent value="coa" className="mt-4">
          <ChartAccountsPanel key={companyId} companyId={companyId} currency={currency} />
        </TabsContent>

        <TabsContent value="industry" className="mt-4">
          <IndustryCoaPanel companyId={companyId} />
        </TabsContent>

        <TabsContent value="corrections" className="mt-4">
          <TransactionCorrections key={companyId} companyId={companyId} />
        </TabsContent>

        <TabsContent value="journals" className="mt-4">
          <JournalsPanel
            key={companyId}
            companyId={companyId}
            currency={currency}
            initialOpenJournalId={search.journal}
          />
        </TabsContent>

        <TabsContent value="post" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manual journal</CardTitle>
            </CardHeader>
            <CardContent className="max-w-4xl">
              <ManualJournalPanel key={companyId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="periods" className="mt-4">
          <FinancialYearsPanel key={companyId} companyId={companyId} />
        </TabsContent>

        <TabsContent value="close" className="mt-4">
          <PeriodClosePanel key={companyId} companyId={companyId} initialPeriodId={search.period} />
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <LedgerHealthPanel key={companyId} companyId={companyId} />
        </TabsContent>

        <TabsContent value="conversion" className="mt-4">
          <ConversionBalancesPanel key={companyId} companyId={companyId} currency={currency} />
        </TabsContent>

        <TabsContent value="fx" className="mt-4">
          <FxPanel key={companyId} companyId={companyId} currency={currency} />
        </TabsContent>
      </Tabs>
    </>
  );
}
