import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useFormat } from "@/hooks/use-format";
import {
  getFixedAsset,
  type AssetAccount,
  type AssetTypeRow,
} from "@/lib/fixed-assets/fixed-assets.functions";
import { summarizeAssetDetailHistory } from "@/lib/fixed-assets/asset-detail-summary";
import { DEPRECIATION_METHODS } from "@/lib/fixed-assets/depreciation";
import { ErrorState, LoadingState } from "@/components/common/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 12;
type DetailSection = "overview" | "depreciation" | "journals";

export function AssetDetailsDialog({
  companyId,
  assetId,
  currency,
  accounts,
  types,
  onClose,
}: {
  companyId: string;
  assetId: string;
  currency: string;
  accounts: AssetAccount[];
  types: AssetTypeRow[];
  onClose: () => void;
}) {
  const fmt = useFormat();
  const fetchAsset = useServerFn(getFixedAsset);
  const [section, setSection] = useState<DetailSection>("overview");
  const [schedulePage, setSchedulePage] = useState(0);
  const [postedPage, setPostedPage] = useState(0);
  const query = useQuery({
    queryKey: ["fixed-assets", companyId, "detail", assetId],
    queryFn: () => fetchAsset({ data: { companyId, assetId } }),
  });
  const detail = query.data;
  const asset = detail?.asset;
  const schedule = detail?.schedule ?? [];
  const numberOfPages = Math.ceil(schedule.length / PAGE_SIZE);
  const postedPages = Math.ceil((detail?.entries.length ?? 0) / PAGE_SIZE);
  const summary = asset && detail
    ? summarizeAssetDetailHistory(asset, detail.entries)
    : null;
  const accountName = (id: string) => {
    const account = accounts.find((a) => a.id === id);
    return account ? account.code + " · " + account.name : "Account not in active list";
  };
  const typeName = asset?.asset_type_id
    ? (types.find((type) => type.id === asset.asset_type_id)?.name ?? "Unlisted type")
    : "Unclassified";
  const methodName = DEPRECIATION_METHODS.find(
    (method) => method.value === asset?.depreciation_method,
  )?.label;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:p-0">
        <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-5 pr-12 text-left sm:px-6 sm:pt-6">
          <DialogTitle>
            {asset ? asset.asset_number + " · " + asset.name : "Fixed asset details"}
          </DialogTitle>
          <DialogDescription>
            Review this asset's saved terms, projected depreciation and actual posting history.
            Viewing never posts a journal or changes the register.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {query.isPending ? (
            <LoadingState />
          ) : query.isError ? (
            <ErrorState
              title="Could not load asset details"
              description={friendlyAuthError(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : asset && detail ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{asset.asset_number}</Badge>
                <Badge variant={asset.status === "disposed" ? "secondary" : "outline"}>
                  {asset.status === "disposed" ? "Disposed" : "Active"}
                </Badge>
                {asset.depreciation_method === "none" ? (
                  <Badge variant="secondary">No depreciation</Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {typeName} · Purchased {fmt.date(asset.purchase_date)}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Asset financial summary">
                {[
                  {
                    label: "Original cost",
                    amount: summary?.costMinor,
                    note: "Saved register cost",
                  },
                  {
                    label: "Posted charges",
                    amount: summary?.postedChargesMinor,
                    note: detail.entries.length + " depreciation entries",
                  },
                  {
                    label: "Accumulated recorded",
                    amount: summary?.recordedAccumulatedMinor,
                    note: "Opening plus posted",
                  },
                  {
                    label: asset.status === "disposed" ? "Disposal date" : "Less recorded depreciation",
                    amount: asset.status === "disposed" ? null : summary?.remainingBeforeDisposalMinor,
                    note: asset.status === "disposed"
                      ? (asset.disposal_date ? fmt.date(asset.disposal_date) : "Not available")
                      : "Not a GL reconciliation",
                  },
                ].map((metric) => (
                  <div className="min-w-0 rounded-lg border bg-card p-3 sm:p-4" key={metric.label}>
                    <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                    <dd className="mt-1 break-words text-base font-semibold tabular-nums sm:text-lg">
                      {metric.amount !== null && metric.amount !== undefined
                        ? fmt.money(metric.amount, currency)
                        : asset.status === "disposed" && metric.label === "Disposal date"
                          ? metric.note
                          : "Unavailable"}
                    </dd>
                    {metric.label !== "Disposal date" ? (
                      <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
                    ) : null}
                  </div>
                ))}
              </dl>
              {summary?.issue ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    The asset summary could not be calculated safely: {summary.issue}
                    {" "}Review the source journal entries before relying on a book value.
                  </AlertDescription>
                </Alert>
              ) : null}

              <Tabs
                value={section}
                onValueChange={(value) => setSection(value as DetailSection)}
                className="min-w-0"
              >
                <TabsList className="w-full justify-start" aria-label="Asset detail sections">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="depreciation">
                    Depreciation schedule
                  </TabsTrigger>
                  <TabsTrigger value="journals">
                    Posted journals ({detail.entries.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 pt-3">
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Asset profile</h3>
                    <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ["Asset type", typeName],
                        ["Purchased", fmt.date(asset.purchase_date)],
                        ["Depreciation starts", fmt.date(asset.depreciation_start_date)],
                        ["Method", methodName ?? asset.depreciation_method],
                        ["Residual value", fmt.money(asset.residual_minor, currency)],
                        ["Opening depreciation", fmt.money(asset.opening_accumulated_minor, currency)],
                        ["Depreciated through", asset.depreciated_through
                          ? fmt.date(asset.depreciated_through)
                          : "No posted period"],
                        ["Cost account", accountName(asset.asset_account_id)],
                        ["Accumulated account", accountName(asset.accumulated_account_id)],
                        ["Expense account", accountName(asset.expense_account_id)],
                        ["Source bill", asset.source_bill_id ? "Linked" : "Not linked"],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="break-words font-medium">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                  {asset.description || asset.notes ? (
                    <section className="space-y-2 rounded-lg border p-4">
                      <h3 className="text-sm font-semibold">Description & notes</h3>
                      {asset.description ? (
                        <p className="whitespace-pre-wrap break-words text-sm">{asset.description}</p>
                      ) : null}
                      {asset.notes ? (
                        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {asset.notes}
                        </p>
                      ) : null}
                    </section>
                  ) : null}
                  {asset.source_bill_id ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/purchases/bills/$billId" params={{ billId: asset.source_bill_id }}>
                        Open purchase bill
                      </Link>
                    </Button>
                  ) : null}
                  {asset.status === "disposed" ? (
                    <section className="space-y-2 rounded-lg border p-4 text-sm">
                      <h3 className="font-semibold">Disposal</h3>
                      <p>Date: {asset.disposal_date ? fmt.date(asset.disposal_date) : "Not available"}</p>
                      <p>
                        Proceeds: {asset.disposal_proceeds_minor === null
                          ? "Not recorded"
                          : fmt.money(asset.disposal_proceeds_minor, currency)}
                      </p>
                      {asset.disposal_journal_id ? (
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            to="/banking/journal/$journalId"
                            params={{ journalId: asset.disposal_journal_id }}
                          >
                            View disposal journal
                          </Link>
                        </Button>
                      ) : (
                        <p className="text-muted-foreground">No linked disposal journal.</p>
                      )}
                    </section>
                  ) : null}
                </TabsContent>

                <TabsContent value="depreciation" className="space-y-3 pt-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Projected depreciation</h3>
                      <p className="text-xs text-muted-foreground">
                        Calculated from the stored asset terms. A projection is not a journal
                        posting, tax depreciation schedule or GL balance.
                      </p>
                    </div>
                    {numberOfPages > 1 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={schedulePage === 0}
                          onClick={() => setSchedulePage((page) => page - 1)}
                        >
                          Previous
                        </Button>
                        <span className="text-xs tabular-nums">
                          {schedulePage + 1} / {numberOfPages}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={schedulePage >= numberOfPages - 1}
                          onClick={() => setSchedulePage((page) => page + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {schedule.length === 0 ? (
                    <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                      No projected depreciation schedule for this asset.
                    </p>
                  ) : (
                    <div className="max-w-full overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period end</TableHead>
                            <TableHead className="text-right">Charge</TableHead>
                            <TableHead className="text-right">Accumulated</TableHead>
                            <TableHead className="text-right">Projected book value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {schedule
                            .slice(schedulePage * PAGE_SIZE, (schedulePage + 1) * PAGE_SIZE)
                            .map((row) => (
                              <TableRow key={row.periodEnd}>
                                <TableCell>{fmt.date(row.periodEnd)}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {fmt.amount(row.amountMinor, currency)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {fmt.amount(row.accumulatedMinor, currency)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {fmt.amount(row.netBookValueMinor, currency)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="journals" className="space-y-3 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Posted depreciation history</h3>
                      <p className="text-xs text-muted-foreground">
                        Each entry links to its posted journal. This is not the entire audit log.
                      </p>
                    </div>
                    {postedPages > 1 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={postedPage === 0}
                          onClick={() => setPostedPage((page) => page - 1)}
                        >
                          Previous
                        </Button>
                        <span className="text-xs tabular-nums">
                          {postedPage + 1} / {postedPages}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={postedPage >= postedPages - 1}
                          onClick={() => setPostedPage((page) => page + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {detail.entries.length === 0 ? (
                    <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                      No depreciation entries have been posted.
                    </p>
                  ) : (
                    <div className="max-w-full overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period end</TableHead>
                            <TableHead className="text-right">Posted charge</TableHead>
                            <TableHead>Journal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.entries
                            .slice(postedPage * PAGE_SIZE, (postedPage + 1) * PAGE_SIZE)
                            .map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell>{fmt.date(entry.period_end)}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {fmt.amount(entry.amount_minor, currency)}
                                </TableCell>
                                <TableCell>
                                  <Link
                                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                                    to="/banking/journal/$journalId"
                                    params={{ journalId: entry.journal_id }}
                                  >
                                    View journal
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {asset.disposal_journal_id ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to="/banking/journal/$journalId"
                        params={{ journalId: asset.disposal_journal_id }}
                      >
                        View disposal journal
                      </Link>
                    </Button>
                  ) : null}
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Asset record unavailable.</p>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
