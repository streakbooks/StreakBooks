import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useFormat } from "@/hooks/use-format";
import {
  getFixedAsset,
  type AssetAccount,
  type AssetTypeRow,
} from "@/lib/fixed-assets/fixed-assets.functions";
import { DEPRECIATION_METHODS } from "@/lib/fixed-assets/depreciation";
import { ErrorState, LoadingState } from "@/components/common/states";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 12;

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
  const [schedulePage, setSchedulePage] = useState(0);
  const query = useQuery({
    queryKey: ["fixed-assets", companyId, "detail", assetId],
    queryFn: () => fetchAsset({ data: { companyId, assetId } }),
  });
  const detail = query.data;
  const asset = detail?.asset;
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
  const schedule = detail?.schedule ?? [];
  const numberOfPages = Math.ceil(schedule.length / PAGE_SIZE);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fixed asset details</DialogTitle>
          <DialogDescription>
            Asset profile, posted depreciation and an illustrative schedule. Viewing does not post
            journals or change accounting records.
          </DialogDescription>
        </DialogHeader>
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
              <span className="font-mono text-xs text-muted-foreground">{asset.asset_number}</span>
              <span className="text-lg font-semibold">{asset.name}</span>
              <Badge variant="secondary">{asset.status === "disposed" ? "Disposed" : "Active"}</Badge>
            </div>
            <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Asset type", typeName],
                ["Purchased", fmt.date(asset.purchase_date)],
                ["Depreciation starts", fmt.date(asset.depreciation_start_date)],
                ["Method", methodName ?? asset.depreciation_method],
                ["Original cost", fmt.amount(asset.cost_minor, currency)],
                ["Residual value", fmt.amount(asset.residual_minor, currency)],
                ["Opening accumulated", fmt.amount(asset.opening_accumulated_minor, currency)],
                ["Depreciated through", asset.depreciated_through ? fmt.date(asset.depreciated_through) : "Not posted"],
                ["Asset account", accountName(asset.asset_account_id)],
                ["Accumulated account", accountName(asset.accumulated_account_id)],
                ["Expense account", accountName(asset.expense_account_id)],
                ["Source bill", asset.source_bill_id ?? "Not linked"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {asset.description || asset.notes ? (
              <div className="space-y-1 rounded-lg border p-4 text-sm">
                {asset.description ? <p><strong>Description:</strong> {asset.description}</p> : null}
                {asset.notes ? <p className="whitespace-pre-wrap"><strong>Notes:</strong> {asset.notes}</p> : null}
              </div>
            ) : null}
            {asset.status === "disposed" ? (
              <div className="rounded-lg border p-4 text-sm">
                <p className="font-medium">Disposal</p>
                <p>Date: {asset.disposal_date ? fmt.date(asset.disposal_date) : "Unknown"}</p>
                <p>
                  Proceeds: {fmt.amount(asset.disposal_proceeds_minor ?? 0, currency)}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  Journal: {asset.disposal_journal_id ?? "Not linked"}
                </p>
              </div>
            ) : null}

            <section className="space-y-2">
              <h3 className="font-semibold">Posted depreciation ({detail.entries.length})</h3>
              {detail.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No depreciation journal entries posted.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period end</TableHead>
                        <TableHead className="text-right">Posted amount</TableHead>
                        <TableHead>Journal reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{fmt.date(entry.period_end)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt.amount(entry.amount_minor, currency)}
                          </TableCell>
                          <TableCell className="break-all font-mono text-xs">{entry.journal_id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Projected depreciation schedule</h3>
                  <p className="text-xs text-muted-foreground">
                    Projection from the saved terms, not evidence of posted journals or a tax schedule.
                  </p>
                </div>
                {numberOfPages > 1 ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={schedulePage === 0}
                      onClick={() => setSchedulePage((page) => page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">No depreciation schedule for this method.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
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
                      {schedule.slice(schedulePage * PAGE_SIZE, (schedulePage + 1) * PAGE_SIZE).map((row) => (
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
            </section>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
