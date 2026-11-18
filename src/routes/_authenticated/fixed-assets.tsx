import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  parseFixedAssetRegisterSearch,
  type FixedAssetRegisterSearch,
} from "@/lib/fixed-assets/register-navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownUp, Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { useTablePrefs } from "@/hooks/use-table-prefs";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { addMonthsIso, monthEnd, monthStart, todayIso } from "@/lib/accounting/fiscal-year";
import { DEPRECIATION_METHODS } from "@/lib/fixed-assets/depreciation";
import {
  planDepreciationMonths,
  summarizeDepreciationPreview,
} from "@/lib/fixed-assets/depreciation-review";
import {
  assetStatusAsOf,
  selectRegisterAssets,
  summariseActiveAssets,
  validAssetAccumulatedAt,
  type AssetRegisterSort,
  type AssetRegisterFilters,
} from "@/lib/fixed-assets/register-view";
import { LookupSelect } from "@/components/lookup";
import {
  deleteFixedAsset,
  getAssetRegisterPage,
  getFixedAssetRegister,
  listCapitalisableBillLines,
  previewDepreciation,
  runDepreciation,
  type AssetTypeRow,
  type CapitaliseLine,
  type FixedAssetRow,
} from "@/lib/fixed-assets/fixed-assets.functions";
import {
  AssetDialog,
  AssetTypeDialog,
  DisposeDialog,
} from "@/components/fixed-assets/AssetDialogs";
import { AssetDetailsDialog } from "@/components/fixed-assets/AssetDetailsDialog";
import { AssetReconciliationPanel } from "@/components/fixed-assets/AssetReconciliationPanel";
import { AssetCapitalisationReviewPanel } from "@/components/fixed-assets/AssetCapitalisationReviewPanel";
import { AssetPortfolioPanel } from "@/components/fixed-assets/AssetPortfolioPanel";
import {
  FIXED_ASSET_COLUMN_IDS,
  FIXED_ASSET_TABLE_COLUMNS,
  FixedAssetSavedFilterViews,
  FixedAssetTableColumns,
} from "@/components/fixed-assets/AssetRegisterPersonalization";
import {
  capitalisationReviewGuidance,
  reviewCapitalisableLines,
  selectCapitalisationReviewRows,
} from "@/lib/fixed-assets/capitalisation-review";
import { buildFixedAssetRegisterCsv } from "@/lib/fixed-assets/register-export";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/fixed-assets")({
  validateSearch: parseFixedAssetRegisterSearch,
  head: () => ({ meta: [{ title: "Fixed assets — LinkBooks" }] }),
  component: FixedAssetsPage,
});

const METHOD_LABEL = new Map(DEPRECIATION_METHODS.map((m) => [m.value, m.label]));

type Dialogs =
  | { kind: "asset"; editing: FixedAssetRow | null; fromBillLine: CapitaliseLine | null }
  | { kind: "type"; editing: AssetTypeRow | null }
  | { kind: "dispose"; asset: FixedAssetRow }
  | { kind: "bill-lines" }
  | { kind: "details"; asset: FixedAssetRow }
  | null;

function FixedAssetsPage() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = search.tab ?? "register";
  const assetSearch = search.q ?? "";
  const assetStatus = search.status ?? "all";
  const assetTypeId = search.typeId ?? "";
  const assetAccountId = search.accountId ?? "";
  const assetSort = search.sort ?? "number";
  const sortDescending = search.desc ?? false;
  const updateRegister = (patch: Partial<FixedAssetRegisterSearch>, replace = false) => {
    void navigate({
      to: "/fixed-assets",
      search: (previous) => parseFixedAssetRegisterSearch({ ...previous, ...patch }),
      replace,
      resetScroll: false,
    });
  };
  const setAssetSearch = (value: string) => updateRegister({ q: value }, true);
  const setAssetStatus = (value: "all" | "active" | "disposed") =>
    updateRegister({ status: value });
  const setAssetTypeId = (value: string) => updateRegister({ typeId: value });
  const setAssetAccountId = (value: string) => updateRegister({ accountId: value });
  const setAssetSort = (value: AssetRegisterSort) => updateRegister({ sort: value });
  const setSortDescending = (value: boolean | ((previous: boolean) => boolean)) =>
    updateRegister({ desc: typeof value === "function" ? value(sortDescending) : value });
  const fmt = useFormat();
  const canManage = useCanDo("accounts.manage");
  const canViewAccounting = useCanDo("accounting.view");
  const canPostEntries = useCanDo("accounting.post");
  const canPostManual = useCanDo("journals.manual");
  const canPost = canPostEntries || canPostManual;
  const pageFn = useServerFn(getAssetRegisterPage);
  const registerFn = useServerFn(getFixedAssetRegister);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const tablePrefs = useTablePrefs(
    "fixed-assets:" + (companyId ?? "no-company"),
    FIXED_ASSET_COLUMN_IDS,
  );
  const columnVisible = (id: string) =>
    id === "asset" || id === "actions" || tablePrefs.isVisible(id);
  const hiddenColumnCount = FIXED_ASSET_TABLE_COLUMNS.filter(
    (col) => !("required" in col && col.required) && !columnVisible(col.id),
  ).length;
  const appliedFilters: AssetRegisterFilters = {
    search: assetSearch,
    status: assetStatus,
    typeId: assetTypeId,
    accountId: assetAccountId,
    sort: assetSort,
    descending: sortDescending,
  };
  const applySavedFilters = (filters: AssetRegisterFilters) => {
    updateRegister({
      q: filters.search,
      status: filters.status,
      typeId: filters.typeId,
      accountId: filters.accountId,
      sort: filters.sort,
      desc: filters.descending,
    });
  };
  const today = useMemo(() => todayIso(), []);

  const page = useQuery({
    queryKey: ["fixed-assets", companyId, "page"],
    enabled: Boolean(companyId),
    queryFn: () => pageFn({ data: { companyId: companyId! } }),
  });
  const register = useQuery({
    queryKey: ["fixed-assets", companyId, "register", today],
    enabled: Boolean(companyId) && page.data?.available === true,
    queryFn: () => registerFn({ data: { companyId: companyId!, asOf: today } }),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (page.isPending) return <LoadingState />;
  if (page.isError) {
    return (
      <ErrorState
        title="Could not load fixed assets"
        description={friendlyAuthError(page.error)}
        onRetry={() => void page.refetch()}
      />
    );
  }
  const d = page.data;
  if (!d.available) {
    return (
      <ListWorkspace title="Fixed assets" description="Register, depreciate and dispose of assets.">
        <Alert>
          <AlertDescription>
            Fixed assets are not available yet: the database updates that add them have not been
            applied.
          </AlertDescription>
        </Alert>
      </ListWorkspace>
    );
  }
  const currency = d.currency;
  const balancesReady = register.isSuccess && !register.isFetching && register.data?.asOf === today;
  const balanceMap =
    balancesReady && register.data
      ? new Map(register.data.rows.map((r) => [r.asset_id, r.accumulated_minor] as const))
      : null;
  const visibleAssets = selectRegisterAssets(d.assets, appliedFilters, d.types, d.accounts);
  const summary = summariseActiveAssets(visibleAssets, today, balanceMap);
  const usedAssetAccounts = new Set(d.assets.map((asset) => asset.asset_account_id));
  const accumulatedOf = (a: FixedAssetRow): number | null =>
    validAssetAccumulatedAt(a, balanceMap?.get(a.id));
  const exportReady =
    balancesReady &&
    visibleAssets.length > 0 &&
    visibleAssets.every((a) => a.purchase_date > today || accumulatedOf(a) !== null);
  const filterActive =
    Boolean(assetSearch.trim()) ||
    assetStatus !== "all" ||
    Boolean(assetTypeId) ||
    Boolean(assetAccountId);

  return (
    <>
      <ListWorkspace
        title="Fixed assets"
        description="Keep a register of what you own, post monthly depreciation and record disposals. Every posting goes through the same journal engine as the rest of your books."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/reports/$reportId" params={{ reportId: "fixed-asset-register" }}>
                Register report
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/reports/$reportId" params={{ reportId: "depreciation-schedule" }}>
                Depreciation schedule
              </Link>
            </Button>
          </>
        }
      >
        <Tabs value={tab}>
          <TabsList
            className="flex min-h-11 w-full max-w-full flex-nowrap justify-start overflow-x-auto gap-1"
            onKeyDown={handleNativeTabKeyDown}
            aria-label="Fixed Assets sections"
          >
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={tab === "dashboard"}
              data-state={tab === "dashboard" ? "active" : "inactive"}
              to="/fixed-assets"
              search={{ tab: "dashboard" }}
            >
              Dashboard
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={tab === "register"}
              data-state={tab === "register" ? "active" : "inactive"}
              to="/fixed-assets"
              search={{ tab: "register" }}
            >
              Register
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={tab === "depreciation"}
              data-state={tab === "depreciation" ? "active" : "inactive"}
              to="/fixed-assets"
              search={{ tab: "depreciation" }}
            >
              Run depreciation
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={tab === "types"}
              data-state={tab === "types" ? "active" : "inactive"}
              to="/fixed-assets"
              search={{ tab: "types" }}
            >
              Asset types
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={tab === "bill-review"}
              data-state={tab === "bill-review" ? "active" : "inactive"}
              to="/fixed-assets"
              search={{ tab: "bill-review" }}
            >
              Review bill purchases
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={tab === "reconciliation"}
              data-state={tab === "reconciliation" ? "active" : "inactive"}
              to="/fixed-assets"
              search={{ tab: "reconciliation" }}
            >
              Reconcile to GL
            </Link>
          </TabsList>
          <p className="mt-1 text-xs text-muted-foreground sm:hidden">
            Swipe the section tabs horizontally to view all Fixed Assets screens.
          </p>

          <TabsContent value="dashboard" className="space-y-4">
            <AssetPortfolioPanel
              assets={d.assets}
              types={d.types}
              currency={currency}
              asOf={today}
              balances={balanceMap}
              balancesLoading={!balancesReady && !register.isError}
              onView={(asset) => setDialog({ kind: "details", asset })}
            />
            {register.isError ? (
              <Alert variant="destructive">
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  Financial summary unavailable: {friendlyAuthError(register.error)}
                  <Button size="sm" variant="outline" onClick={() => void register.refetch()}>
                    Retry balances
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </TabsContent>

          <TabsContent value="register" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Active assets in view", value: String(summary.activeCount) },
                {
                  label: "Original cost in view",
                  value:
                    summary.costMinor === null
                      ? "Unavailable"
                      : fmt.amount(summary.costMinor, currency),
                },
                {
                  label: "Accumulated depreciation",
                  value:
                    summary.accumulatedMinor === null
                      ? balancesReady || register.isError
                        ? "Unavailable"
                        : "Loading…"
                      : fmt.amount(summary.accumulatedMinor, currency),
                },
                {
                  label: "Net book value",
                  value:
                    summary.netBookValueMinor === null
                      ? balancesReady || register.isError
                        ? "Unavailable"
                        : "Loading…"
                      : fmt.amount(summary.netBookValueMinor, currency),
                },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg border bg-card p-4">
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{metric.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Balances as at {fmt.date(today)}. Totals reflect active assets matching the current
              filters; future purchases and completed disposals are excluded.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!canManage}
                onClick={() => setDialog({ kind: "asset", editing: null, fromBillLine: null })}
              >
                Add asset
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canManage}
                onClick={() => setDialog({ kind: "bill-lines" })}
              >
                Capitalise from a bill
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/imports" search={{ module: "fixed_assets" }}>
                  Import fixed assets
                </Link>
              </Button>
            </div>
            {d.assets.length > 0 ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      aria-label="Search fixed assets"
                      className="pl-9"
                      placeholder="Search asset, notes, type or account"
                      value={assetSearch}
                      onChange={(event) => setAssetSearch(event.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Filter asset status"
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={assetStatus}
                    onChange={(event) =>
                      setAssetStatus(event.target.value as "all" | "active" | "disposed")
                    }
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="disposed">Disposed</option>
                  </select>
                  <div className="min-w-[170px] flex-1 sm:max-w-[250px]">
                    <LookupSelect
                      ariaLabel="Filter by asset type"
                      value={assetTypeId}
                      onChange={setAssetTypeId}
                      placeholder="All asset types"
                      searchPlaceholder="Search asset types"
                      allowClear
                      companyId={companyId}
                      options={d.types.map((type) => ({
                        id: type.id,
                        name: type.name,
                        label: type.name,
                        keywords: type.name,
                      }))}
                    />
                  </div>
                  <div className="min-w-[185px] flex-1 sm:max-w-[290px]">
                    <LookupSelect
                      ariaLabel="Filter by asset GL account"
                      value={assetAccountId}
                      onChange={setAssetAccountId}
                      placeholder="All asset accounts"
                      searchPlaceholder="Search GL accounts"
                      allowClear
                      companyId={companyId}
                      options={d.accounts
                        .filter((account) => usedAssetAccounts.has(account.id))
                        .map((account) => ({
                          id: account.id,
                          name: account.name,
                          label: account.code + " · " + account.name,
                          keywords: account.code + " " + account.name,
                        }))}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Sort fixed assets"
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={assetSort}
                    onChange={(event) => setAssetSort(event.target.value as AssetRegisterSort)}
                  >
                    <option value="number">Sort: Asset number</option>
                    <option value="name">Sort: Name</option>
                    <option value="purchase">Sort: Purchase date</option>
                    <option value="cost">Sort: Original cost</option>
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={sortDescending ? "Sort ascending" : "Sort descending"}
                    onClick={() => setSortDescending((current) => !current)}
                  >
                    <ArrowDownUp className="mr-2 size-4" />
                    {sortDescending ? "Descending" : "Ascending"}
                  </Button>
                  {filterActive ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAssetSearch("");
                        setAssetStatus("all");
                        setAssetTypeId("");
                        setAssetAccountId("");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : null}
                  <FixedAssetTableColumns
                    visible={columnVisible}
                    hiddenCount={hiddenColumnCount}
                    density={tablePrefs.density}
                    toggle={tablePrefs.toggle}
                    setDensity={tablePrefs.setDensity}
                    reset={tablePrefs.reset}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!exportReady}
                    title={
                      exportReady
                        ? "Exports the complete standard asset register, independent of hidden screen columns"
                        : "A complete, current depreciation balance is required to export"
                    }
                    onClick={() =>
                      exportAssetRegisterCsv(
                        visibleAssets,
                        balanceMap,
                        today,
                        new Map(d.types.map((type) => [type.id, type.name])),
                        new Map(
                          d.accounts.map((account) => [
                            account.id,
                            account.code + " · " + account.name,
                          ]),
                        ),
                      )
                    }
                  >
                    <Download className="mr-2 size-4" /> Export CSV
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {visibleAssets.length} of {d.assets.length} assets
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-start gap-3 border-t pt-3">
                  <FixedAssetSavedFilterViews
                    companyId={companyId}
                    filters={appliedFilters}
                    onApply={applySavedFilters}
                  />
                </div>
              </div>
            ) : null}
            {register.isError ? (
              <Alert variant="destructive">
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  Depreciation balances could not be loaded. Disposal and balance exports are paused
                  until a fresh register is available. {friendlyAuthError(register.error)}
                  <Button size="sm" variant="outline" onClick={() => void register.refetch()}>
                    Retry balances
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {d.assets.length === 0 ? (
              <EmptyState
                title="No fixed assets"
                description="Add an asset, or capitalise a line from a posted bill."
              />
            ) : visibleAssets.length === 0 ? (
              <EmptyState
                title="No matching assets"
                description="Try different filters or clear the search."
              />
            ) : (
              <RegisterTable
                assets={visibleAssets}
                types={d.types}
                accounts={d.accounts}
                columnVisible={columnVisible}
                density={tablePrefs.density}
                currency={currency}
                accumulatedOf={accumulatedOf}
                canManage={canManage}
                canPost={canPost}
                companyId={companyId}
                onEdit={(a) => setDialog({ kind: "asset", editing: a, fromBillLine: null })}
                onView={(a) => setDialog({ kind: "details", asset: a })}
                onDispose={(a) => setDialog({ kind: "dispose", asset: a })}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Registering an asset does not post anything: the purchase is already in your books.
              Depreciation is charged for whole months from the month depreciation starts.
            </p>
          </TabsContent>

          <TabsContent value="depreciation">
            <DepreciationPanel
              companyId={companyId}
              currency={currency}
              assets={d.assets}
              lastRunThrough={d.lastRunThrough}
              canPost={canPost}
            />
          </TabsContent>

          <TabsContent value="bill-review" className="space-y-4">
            <AssetCapitalisationReviewPanel
              companyId={companyId}
              currency={currency}
              canManage={canManage}
              onCreate={(line) => setDialog({ kind: "asset", editing: null, fromBillLine: line })}
            />
          </TabsContent>

          <TabsContent value="reconciliation" className="space-y-4">
            {canViewAccounting ? (
              <AssetReconciliationPanel companyId={companyId} />
            ) : (
              <Alert>
                <AlertDescription>
                  GL reconciliation requires accounting view permission for this organisation. Ask
                  an organisation administrator to review your access.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="types" className="space-y-4">
            <Button
              size="sm"
              disabled={!canManage}
              onClick={() => setDialog({ kind: "type", editing: null })}
            >
              New asset type
            </Button>
            {d.types.length === 0 ? (
              <EmptyState
                title="No asset types"
                description="Types such as Computers or Vehicles set default methods and accounts."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Life / rate</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.types.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{METHOD_LABEL.get(t.depreciation_method)}</TableCell>
                      <TableCell className="text-right">
                        {t.depreciation_method === "straight_line"
                          ? `${t.useful_life_months} months`
                          : t.depreciation_method === "reducing_balance"
                            ? `${fmt.percentBps(t.annual_rate_bps ?? 0)} a year`
                            : "–"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canManage}
                          onClick={() => setDialog({ kind: "type", editing: t })}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </ListWorkspace>

      {dialog?.kind === "asset" ? (
        <AssetDialog
          key={dialog.editing?.id ?? dialog.fromBillLine?.lineId ?? "new"}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          companyId={companyId}
          currency={currency}
          accounts={d.accounts}
          types={d.types}
          editing={dialog.editing}
          fromBillLine={dialog.fromBillLine}
          frozen={
            dialog.editing
              ? dialog.editing.depreciated_through !== null || dialog.editing.status === "disposed"
              : false
          }
        />
      ) : null}
      {dialog?.kind === "details" ? (
        <AssetDetailsDialog
          key={dialog.asset.id}
          companyId={companyId}
          assetId={dialog.asset.id}
          currency={currency}
          accounts={d.accounts}
          types={d.types}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "type" ? (
        <AssetTypeDialog
          key={dialog.editing?.id ?? "new"}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          companyId={companyId}
          accounts={d.accounts}
          editing={dialog.editing}
        />
      ) : null}
      {dialog?.kind === "dispose" && accumulatedOf(dialog.asset) !== null ? (
        <DisposeDialog
          key={dialog.asset.id}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          companyId={companyId}
          currency={currency}
          accounts={d.accounts}
          asset={dialog.asset}
          accumulatedMinor={accumulatedOf(dialog.asset) ?? 0}
        />
      ) : null}
      {dialog?.kind === "bill-lines" ? (
        <BillLinesDialog
          companyId={companyId}
          currency={currency}
          onClose={() => setDialog(null)}
          onPick={(line) => setDialog({ kind: "asset", editing: null, fromBillLine: line })}
        />
      ) : null}
    </>
  );
}

/** Export the visible tenant-scoped register with real as-at balances, not fallback estimates. */
function exportAssetRegisterCsv(
  assets: FixedAssetRow[],
  accumulatedByAssetId: ReadonlyMap<string, number> | null,
  asOf: string,
  typeNames: ReadonlyMap<string, string>,
  accountNames: ReadonlyMap<string, string>,
) {
  try {
    const csv = buildFixedAssetRegisterCsv(
      assets,
      accumulatedByAssetId,
      asOf,
      typeNames,
      accountNames,
    );
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linkbooks-fixed-assets-" + asOf + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Cannot export asset register.");
  }
}

function RegisterTable({
  assets,
  types,
  accounts,
  columnVisible,
  density,
  currency,
  accumulatedOf,
  canManage,
  canPost,
  companyId,
  onEdit,
  onView,
  onDispose,
}: {
  assets: FixedAssetRow[];
  types: AssetTypeRow[];
  accounts: Array<{ id: string; code: string; name: string }>;
  columnVisible: (id: string) => boolean;
  density: "comfortable" | "compact";
  currency: string;
  accumulatedOf: (a: FixedAssetRow) => number | null;
  canManage: boolean;
  canPost: boolean;
  companyId: string;
  onEdit: (a: FixedAssetRow) => void;
  onView: (a: FixedAssetRow) => void;
  onDispose: (a: FixedAssetRow) => void;
}) {
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  const accountNames = new Map(
    accounts.map((account) => [account.id, account.code + " · " + account.name]),
  );
  const compactCellClass = density === "compact" ? "py-1.5" : undefined;
  const deleteFn = useServerFn(deleteFixedAsset);
  const asOf = todayIso();
  const remove = useMutation({
    mutationFn: (assetId: string) => deleteFn({ data: { companyId, assetId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fixed-assets", companyId] });
      toast.success("Asset deleted");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const removeAsset = (asset: FixedAssetRow) => {
    if (window.confirm(`Delete ${asset.asset_number} ${asset.name}? This cannot be undone.`)) {
      remove.mutate(asset.id);
    }
  };
  const actions = (asset: FixedAssetRow, accumulated: number | null, compact = false) => {
    const status = assetStatusAsOf(asset, asOf);
    const isDisposed = asset.status === "disposed";
    const hasPosted = asset.depreciated_through !== null;
    return (
      <div
        className={
          compact
            ? "flex flex-wrap items-center gap-1 border-t pt-3"
            : "flex items-center justify-end gap-1"
        }
      >
        {compact ? (
          <Button size="sm" variant="outline" onClick={() => onView(asset)}>
            View
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={!canManage || isDisposed}
          onClick={() => onEdit(asset)}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canPost || status !== "active" || accumulated === null}
          title={status === "not_acquired" ? "The asset has not yet been purchased" : undefined}
          onClick={() => onDispose(asset)}
        >
          Dispose
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canManage || isDisposed || hasPosted || remove.isPending}
          title={
            isDisposed || hasPosted
              ? "An asset with posted depreciation or disposal cannot be deleted"
              : "Delete this unposted asset"
          }
          onClick={() => removeAsset(asset)}
        >
          Delete
        </Button>
      </div>
    );
  };

  const statusBadge = (asset: FixedAssetRow) => {
    const status = assetStatusAsOf(asset, asOf);
    if (status === "not_acquired") return <Badge variant="outline">Future purchase</Badge>;
    if (status === "disposed") return <Badge variant="secondary">Disposed</Badge>;
    return <Badge variant="outline">Active</Badge>;
  };

  return (
    <>
      <div className="grid gap-3 md:hidden" aria-label="Fixed asset register cards">
        {assets.map((asset) => {
          const accumulated = accumulatedOf(asset);
          const status = assetStatusAsOf(asset, asOf);
          const remaining =
            status === "active" && accumulated !== null
              ? fmt.amount(asset.cost_minor - accumulated, currency)
              : "—";
          return (
            <article
              key={asset.id}
              className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-sm"
              aria-label={asset.asset_number + " " + asset.name}
            >
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted-foreground">{asset.asset_number}</p>
                  <button
                    type="button"
                    className="mt-1 break-words text-left font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => onView(asset)}
                    aria-label={"View details for " + asset.asset_number + " " + asset.name}
                  >
                    {asset.name}
                  </button>
                </div>
                {statusBadge(asset)}
              </header>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ["Purchased", fmt.date(asset.purchase_date)],
                  ["Method", METHOD_LABEL.get(asset.depreciation_method) ?? "—"],
                  ["Original cost", fmt.money(asset.cost_minor, currency)],
                  [
                    "Accumulated",
                    accumulated === null ? "Unavailable" : fmt.money(accumulated, currency),
                  ],
                  ["Net book value", remaining],
                  [
                    "Posted through",
                    asset.depreciated_through ? fmt.date(asset.depreciated_through) : "Not posted",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="break-words font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              {actions(asset, accumulated, true)}
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table className="min-w-[960px]" aria-label="Fixed asset register">
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              {columnVisible("status") ? <TableHead>Status</TableHead> : null}
              {columnVisible("purchased") ? <TableHead>Purchased</TableHead> : null}
              {columnVisible("method") ? <TableHead>Method</TableHead> : null}
              {columnVisible("type") ? <TableHead>Asset type</TableHead> : null}
              {columnVisible("account") ? <TableHead>Cost GL account</TableHead> : null}
              {columnVisible("cost") ? <TableHead className="text-right">Cost</TableHead> : null}
              {columnVisible("residual") ? (
                <TableHead className="text-right">Residual</TableHead>
              ) : null}
              {columnVisible("accumulated") ? (
                <TableHead className="text-right">Accumulated</TableHead>
              ) : null}
              {columnVisible("bookValue") ? (
                <TableHead className="text-right">Net book value</TableHead>
              ) : null}
              {columnVisible("depreciatedTo") ? <TableHead>Depreciated to</TableHead> : null}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset) => {
              const accumulated = accumulatedOf(asset);
              const status = assetStatusAsOf(asset, asOf);
              return (
                <TableRow key={asset.id}>
                  <TableCell className={compactCellClass}>
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {asset.asset_number}
                    </span>
                    <button
                      type="button"
                      className="text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => onView(asset)}
                      aria-label={"View details for " + asset.asset_number + " " + asset.name}
                    >
                      {asset.name}
                    </button>
                  </TableCell>
                  {columnVisible("status") ? (
                    <TableCell className={compactCellClass}>{statusBadge(asset)}</TableCell>
                  ) : null}
                  {columnVisible("purchased") ? (
                    <TableCell className={compactCellClass}>
                      {fmt.date(asset.purchase_date)}
                    </TableCell>
                  ) : null}
                  {columnVisible("method") ? (
                    <TableCell className={compactCellClass}>
                      {METHOD_LABEL.get(asset.depreciation_method) ?? "—"}
                    </TableCell>
                  ) : null}
                  {columnVisible("type") ? (
                    <TableCell className={compactCellClass}>
                      {asset.asset_type_id
                        ? (typeNames.get(asset.asset_type_id) ?? "Unlisted type")
                        : "Unclassified"}
                    </TableCell>
                  ) : null}
                  {columnVisible("account") ? (
                    <TableCell className={compactCellClass}>
                      {accountNames.get(asset.asset_account_id) ?? "Historical account"}
                    </TableCell>
                  ) : null}
                  {columnVisible("cost") ? (
                    <TableCell className={"text-right tabular-nums " + (compactCellClass ?? "")}>
                      {fmt.amount(asset.cost_minor, currency)}
                    </TableCell>
                  ) : null}
                  {columnVisible("residual") ? (
                    <TableCell className={"text-right tabular-nums " + (compactCellClass ?? "")}>
                      {fmt.amount(asset.residual_minor, currency)}
                    </TableCell>
                  ) : null}
                  {columnVisible("accumulated") ? (
                    <TableCell className={"text-right tabular-nums " + (compactCellClass ?? "")}>
                      {accumulated === null ? "Unavailable" : fmt.amount(accumulated, currency)}
                    </TableCell>
                  ) : null}
                  {columnVisible("bookValue") ? (
                    <TableCell className={"text-right tabular-nums " + (compactCellClass ?? "")}>
                      {status !== "active" || accumulated === null
                        ? "—"
                        : fmt.amount(asset.cost_minor - accumulated, currency)}
                    </TableCell>
                  ) : null}
                  {columnVisible("depreciatedTo") ? (
                    <TableCell className={compactCellClass}>
                      {asset.depreciated_through
                        ? fmt.date(asset.depreciated_through)
                        : "Not posted"}
                    </TableCell>
                  ) : null}
                  <TableCell className={compactCellClass}>{actions(asset, accumulated)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** First month that still needs depreciation across active assets (month start), or null. */
function earliestOutstanding(assets: FixedAssetRow[]): string | null {
  let best: string | null = null;
  for (const a of assets) {
    if (a.status !== "active" || a.depreciation_method === "none") continue;
    const next = a.depreciated_through
      ? monthStart(addMonthsIso(monthStart(a.depreciated_through), 1))
      : monthStart(a.depreciation_start_date);
    if (best === null || next < best) best = next;
  }
  return best;
}

function DepreciationPanel({
  companyId,
  currency,
  assets,
  lastRunThrough,
  canPost,
}: {
  companyId: string;
  currency: string;
  assets: FixedAssetRow[];
  lastRunThrough: string | null;
  canPost: boolean;
}) {
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const previewFn = useServerFn(previewDepreciation);
  const runFn = useServerFn(runDepreciation);
  const thisMonth = monthStart(todayIso());
  const outstanding = earliestOutstanding(assets);
  const [month, setMonth] = useState(
    (outstanding && outstanding <= thisMonth ? outstanding : thisMonth).slice(0, 7),
  );
  const [rowFilter, setRowFilter] = useState<"all" | "due" | "behind" | "other">("all");
  const [previewPage, setPreviewPage] = useState(0);
  const [confirmation, setConfirmation] = useState<{
    mode: "one" | "catch_up";
    periodEnd: string;
    periodEnds: string[];
    firstPeriodEnd: string;
    lastPeriodEnd: string;
    remainingMonths: number;
  } | null>(null);
  const validMonth =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    month.slice(0, 4) !== "0000" &&
    month <= thisMonth.slice(0, 7);
  const periodEnd = validMonth ? monthEnd(month + "-01") : "";
  const preview = useQuery({
    queryKey: ["fixed-assets", companyId, "preview", periodEnd],
    enabled: validMonth && canPost,
    queryFn: () => previewFn({ data: { companyId, periodEnd } }),
  });
  const reviewed = useMemo(() => {
    if (!preview.data || preview.data.periodEnd !== periodEnd)
      return { summary: null, issue: null };
    try {
      return {
        summary: summarizeDepreciationPreview(preview.data.rows, preview.data.totalMinor),
        issue: null,
      };
    } catch (error) {
      return {
        summary: null,
        issue: error instanceof Error ? error.message : "Invalid preview data.",
      };
    }
  }, [preview.data, periodEnd]);
  const plan = useMemo(() => {
    if (!validMonth) return null;
    try {
      return planDepreciationMonths(outstanding, month);
    } catch {
      return null;
    }
  }, [outstanding, month, validMonth]);
  const previewReady =
    preview.isSuccess &&
    !preview.isFetching &&
    preview.data?.periodEnd === periodEnd &&
    reviewed.summary !== null;
  const summary = reviewed.summary;
  const rows = preview.data?.periodEnd === periodEnd ? preview.data.rows : [];
  const visibleRows = rows.filter(
    (row) =>
      rowFilter === "all" ||
      row.status === rowFilter ||
      (rowFilter === "other" && row.status !== "due" && row.status !== "behind"),
  );
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(previewPage, pages - 1);
  const shown = visibleRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const catchUpAvailable = Boolean(
    plan && plan.periodEnds.length > 1 && summary && (summary.behind > 0 || summary.due > 0),
  );

  const post = useMutation({
    mutationFn: (periodEnds: string[]) => runFn({ data: { companyId, periodEnds } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["fixed-assets", companyId] });
      if (result.posted.length > 0) {
        const value = result.posted.reduce(
          (total, period) => total + BigInt(period.totalMinor),
          0n,
        );
        toast.success(
          `Processed ${result.posted.length} month${result.posted.length === 1 ? "" : "s"} (${fmt.money(value, currency)} posted).`,
        );
      }
      if (result.failure)
        toast.error(`Stopped at ${fmt.date(result.failure.periodEnd)}: ${result.failure.message}`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const requestPosting = (mode: "one" | "catch_up") => {
    if (!canPost || post.isPending || !previewReady || !summary || !plan) return;
    if (mode === "one" && summary.due === 0) return;
    const periodEnds = mode === "one" ? [periodEnd] : [...plan.periodEnds];
    if (mode === "catch_up" && !catchUpAvailable) return;
    setConfirmation({
      mode,
      periodEnd,
      periodEnds,
      firstPeriodEnd: periodEnds[0]!,
      lastPeriodEnd: periodEnds[periodEnds.length - 1]!,
      remainingMonths: mode === "catch_up" ? plan.remainingMonths : 0,
    });
  };

  const confirmPosting = () => {
    if (
      !confirmation ||
      !previewReady ||
      post.isPending ||
      !canPost ||
      confirmation.periodEnd !== periodEnd ||
      !plan
    )
      return;
    const expected = confirmation.mode === "one" ? [periodEnd] : plan.periodEnds;
    if (expected.join("|") !== confirmation.periodEnds.join("|")) return;
    setConfirmation(null);
    post.mutate(expected);
  };

  const STATUS: Record<string, string> = {
    due: "Ready to post",
    posted: "Posted",
    not_started: "Not started yet",
    behind: "Earlier months outstanding",
    done: "Already depreciated",
    nothing_left: "Fully depreciated",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="dep-month">Depreciation month</Label>
          <Input
            id="dep-month"
            type="month"
            value={month}
            max={thisMonth.slice(0, 7)}
            aria-invalid={!validMonth}
            aria-describedby={!validMonth ? "dep-month-error" : undefined}
            onChange={(event) => {
              setMonth(event.target.value);
              setPreviewPage(0);
              setConfirmation(null);
            }}
          />
          {!validMonth ? (
            <p id="dep-month-error" className="text-xs text-destructive">
              Choose a valid month up to the current month.
            </p>
          ) : null}
        </div>
        <p className="max-w-2xl pb-2 text-sm text-muted-foreground">
          {lastRunThrough
            ? `Last recorded run: ${fmt.date(lastRunThrough)}.`
            : "No depreciation run recorded yet."}{" "}
          Previewing never posts journals. Posting requires confirmation and is revalidated by the
          accounting engine, including closed periods.
        </p>
      </div>

      {!validMonth ? (
        <Alert variant="destructive">
          <AlertDescription>
            Select a valid depreciation month to view its preview.
          </AlertDescription>
        </Alert>
      ) : !canPost ? (
        <Alert>
          <AlertDescription>
            Depreciation previews require accounting posting or manual journal permission under the
            current database policy, even though a preview does not create entries. Ask an
            organisation administrator to review your access.
          </AlertDescription>
        </Alert>
      ) : preview.isPending ? (
        <LoadingState />
      ) : preview.isError ? (
        <ErrorState
          title="Could not preview depreciation"
          description={friendlyAuthError(preview.error)}
          onRetry={() => void preview.refetch()}
        />
      ) : reviewed.issue ? (
        <Alert variant="destructive">
          <AlertDescription>
            Preview values require review before any posting: {reviewed.issue}
          </AlertDescription>
        </Alert>
      ) : previewReady && summary ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Ready for selected month", value: String(summary.due) },
              { label: "Earlier periods outstanding", value: String(summary.behind) },
              {
                label: "Already posted / completed",
                value: String(summary.alreadyDone + summary.fullyDepreciated),
              },
              { label: "Preview charge", value: fmt.money(summary.totalDueMinor, currency) },
            ].map((metric) => (
              <div key={metric.label} className="min-w-0 rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="mt-2 break-words text-lg font-semibold tabular-nums">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
          {summary.behind > 0 ? (
            <Alert>
              <AlertDescription>
                {summary.behind} asset{summary.behind === 1 ? " has" : "s have"} earlier months
                outstanding. Work from the earliest period and check for locked periods.
              </AlertDescription>
            </Alert>
          ) : null}
          {plan && plan.remainingMonths > 0 ? (
            <Alert>
              <AlertDescription>
                A catch-up contains more than 36 months. This request can process only
                {plan.periodEnds.length} months, {fmt.date(plan.firstPeriodEnd)} through
                {fmt.date(plan.lastPeriodEnd)}, with {plan.remainingMonths} later months remaining.
                Reopen the preview after each run.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="dep-preview-filter">Preview rows</Label>
              <select
                id="dep-preview-filter"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={rowFilter}
                onChange={(event) => {
                  setRowFilter(event.target.value as typeof rowFilter);
                  setPreviewPage(0);
                }}
              >
                <option value="all">All ({rows.length})</option>
                <option value="due">Ready ({summary.due})</option>
                <option value="behind">Earlier periods ({summary.behind})</option>
                <option value="other">Other statuses</option>
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={preview.isFetching}
                onClick={() => void preview.refetch()}
              >
                Refresh preview
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {visibleRows.length} rows · {pageSize} per page
            </p>
          </div>
          {visibleRows.length === 0 ? (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">
              No assets match the selected preview status.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Charge this month</TableHead>
                    <TableHead className="text-right">Accumulated after</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((row) => (
                    <TableRow key={row.asset_id}>
                      <TableCell className="min-w-44">
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          {row.asset_number}
                        </span>
                        {row.asset_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "due" ? "outline" : "secondary"}>
                          {STATUS[row.status] ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.status === "due" ? fmt.amount(row.amount_minor, currency) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.status === "due"
                          ? fmt.amount(row.accumulated_after_minor, currency)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Page {currentPage + 1} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 0}
                  onClick={() => setPreviewPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= pages - 1}
                  onClick={() => setPreviewPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={
                !canPost ||
                post.isPending ||
                !previewReady ||
                summary.due === 0 ||
                summary.behind > 0
              }
              title={
                !canPost
                  ? "You lack permission to post journals"
                  : summary.behind > 0
                    ? "Post the earlier outstanding months first"
                    : undefined
              }
              onClick={() => requestPosting("one")}
            >
              {post.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              Review posting for {fmt.date(periodEnd)}
            </Button>
            {catchUpAvailable ? (
              <Button
                variant="outline"
                disabled={!canPost || post.isPending || !previewReady}
                onClick={() => requestPosting("catch_up")}
              >
                Review {plan?.periodEnds.length ?? 0}-month catch-up
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            These values are a read-only preview for the selected month, not a promise of journals
            that will post. A multi-month catch-up is recalculated by the server for each month;
            this month's charge is <strong>not</strong> its total.
          </p>
        </>
      ) : null}

      {post.data || post.isError ? (
        <section className="space-y-2 rounded-lg border p-4" aria-live="polite">
          <h3 className="font-semibold">Last depreciation run result</h3>
          {post.data ? (
            <>
              <p className="text-sm">
                {post.data.posted.length} month(s) processed. Journal amounts below are actual
                returned posting results, not prior preview estimates.
              </p>
              <ul className="space-y-1 text-sm">
                {post.data.posted.map((item) => (
                  <li key={item.periodEnd} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {fmt.date(item.periodEnd)} · {item.assets} asset(s)
                    </span>
                    <span className="tabular-nums">{fmt.money(item.totalMinor, currency)}</span>
                  </li>
                ))}
              </ul>
              {post.data.failure ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    Stopped at {fmt.date(post.data.failure.periodEnd)}: {post.data.failure.message}.
                    Earlier months may have posted; review them before retrying.
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          ) : null}
          {post.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Could not run depreciation: {friendlyAuthError(post.error)}
              </AlertDescription>
            </Alert>
          ) : null}
        </section>
      ) : null}

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => !open && !post.isPending && setConfirmation(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm depreciation posting</DialogTitle>
            <DialogDescription>
              Posting creates or reuses authorised monthly journal records, subject to period locks
              and server-side permissions.
            </DialogDescription>
          </DialogHeader>
          {confirmation ? (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                <dt className="text-muted-foreground">First month</dt>
                <dd>{fmt.date(confirmation.firstPeriodEnd)}</dd>
                <dt className="text-muted-foreground">Last month</dt>
                <dd>{fmt.date(confirmation.lastPeriodEnd)}</dd>
                <dt className="text-muted-foreground">Periods requested</dt>
                <dd>{confirmation.periodEnds.length}</dd>
                {confirmation.mode === "one" && summary ? (
                  <>
                    <dt className="text-muted-foreground">Ready assets</dt>
                    <dd>{summary.due}</dd>
                    <dt className="text-muted-foreground">Preview charge</dt>
                    <dd>{fmt.money(summary.totalDueMinor, currency)}</dd>
                  </>
                ) : null}
              </dl>
              {confirmation.mode === "catch_up" ? (
                <Alert>
                  <AlertDescription>
                    Each period is recalculated on the server. The one-month preview charge does not
                    represent the total catch-up. The run stops at the first failed period;
                    successful earlier months remain posted.
                  </AlertDescription>
                </Alert>
              ) : null}
              {confirmation.remainingMonths > 0 ? (
                <p className="text-muted-foreground">
                  {confirmation.remainingMonths} later months will still need review.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Do not continue unless you have checked depreciation policy, postings, and
                period-lock requirements. Posting cannot be cancelled after submission.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmation(null)}
              disabled={post.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmPosting}
              disabled={
                !confirmation ||
                !previewReady ||
                post.isPending ||
                !canPost ||
                confirmation.periodEnd !== periodEnd
              }
            >
              {post.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Confirm and post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BillLinesDialog({
  companyId,
  currency,
  onClose,
  onPick,
}: {
  companyId: string;
  currency: string;
  onClose: () => void;
  onPick: (line: CapitaliseLine) => void;
}) {
  const fmt = useFormat();
  const listFn = useServerFn(listCapitalisableBillLines);
  const [search, setSearch] = useState("");
  const [showLinked, setShowLinked] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const q = useQuery({
    queryKey: ["fixed-assets", companyId, "bill-lines"],
    queryFn: () => listFn({ data: { companyId } }),
  });
  const review = useMemo(
    () => reviewCapitalisableLines(q.data?.lines ?? [], currency),
    [q.data?.lines, currency],
  );
  const matches = useMemo(
    () =>
      selectCapitalisationReviewRows(review.rows, {
        status: showLinked ? "all" : "attention",
        query: search,
        accountId: "",
      }),
    [review.rows, search, showLinked],
  );
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Capitalise from a bill</DialogTitle>
          <DialogDescription>
            Posted bill lines coded to asset accounts are candidates for review, not proof of
            capital purchases. Select a bill line to prepare an asset registration; the original
            purchase is not posted again.
          </DialogDescription>
        </DialogHeader>
        {q.isPending ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState
            title="Could not load bill lines"
            description={friendlyAuthError(q.error)}
            onRetry={() => void q.refetch()}
          />
        ) : q.data.lines.length === 0 ? (
          <EmptyState
            title="No asset-coded posted bill lines"
            description="An authorised bill line coded to an asset account can appear here."
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Search bill lines"
                className="min-w-[170px] flex-1"
                value={search}
                placeholder="Find bill, supplier or account"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowLinked((current) => !current);
                  setPage(0);
                }}
              >
                {showLinked ? "Hide linked lines" : "Show all linked lines"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {matches.length} matching of {q.data.lines.length} lines
              </span>
            </div>
            {matches.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                No matching lines. Try showing linked lines or changing the search.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill</TableHead>
                        <TableHead>Description / status</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="text-right">Linked base cost</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((line) => (
                        <TableRow key={line.lineId}>
                          <TableCell>
                            {line.billNumber ?? "Bill"}
                            <span className="block text-xs text-muted-foreground">
                              {line.supplier ?? ""} · {fmt.date(line.billDate)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {line.description}
                            <span className="block text-xs text-muted-foreground">
                              {line.status.replace(/_/g, " ")}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt.amount(line.netMinor, line.currency)}
                            {line.currency !== currency ? (
                              <span className="block text-xs text-muted-foreground">
                                {line.currency} · verify FX
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt.amount(line.registeredMinor, currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              disabled={
                                !capitalisationReviewGuidance(line.status).canPrepareNewAsset
                              }
                              title={
                                capitalisationReviewGuidance(line.status).canPrepareNewAsset
                                  ? "Verify eligible acquisition costs before registration"
                                  : "Review this bill and any existing linked assets before creating another record"
                              }
                              onClick={() => onPick(line)}
                            >
                              Review / use
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Page {currentPage + 1} of {pages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage >= pages - 1}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
