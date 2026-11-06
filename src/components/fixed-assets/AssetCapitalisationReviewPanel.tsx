import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Search, RefreshCw } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import { todayIso } from "@/lib/accounting/fiscal-year";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listCapitalisableBillLines,
  type CapitaliseLine,
} from "@/lib/fixed-assets/fixed-assets.functions";
import {
  capitalisationReviewCsv,
  reviewCapitalisableLines,
  selectCapitalisationReviewRows,
  type CapitalisationReviewStatus,
} from "@/lib/fixed-assets/capitalisation-review";
import { LookupSelect } from "@/components/lookup";
import { ErrorState, LoadingState } from "@/components/common/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Filter = "attention" | "all" | CapitalisationReviewStatus;
const PAGE_SIZE = 25;

const STATUS_LABEL: Record<CapitalisationReviewStatus, string> = {
  unlinked: "No asset linked",
  partially_linked: "Partial link",
  linked: "Asset linked",
  fx_review: "FX review",
  overlinked: "Overlinked",
  non_purchase: "Non-purchase amount",
};

export function AssetCapitalisationReviewPanel({
  companyId,
  currency,
  canManage,
  onCreate,
}: {
  companyId: string;
  currency: string;
  canManage: boolean;
  onCreate: (line: CapitaliseLine) => void;
}) {
  const fmt = useFormat();
  const today = useMemo(() => todayIso(), []);
  const [asOf, setAsOf] = useState(today);
  const [filter, setFilter] = useState<Filter>("attention");
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [page, setPage] = useState(0);
  const fetchCandidates = useServerFn(listCapitalisableBillLines);
  const candidates = useQuery({
    queryKey: ["fixed-assets", companyId, "capitalisation-review", asOf],
    enabled: Boolean(companyId) && Boolean(asOf) && asOf <= today,
    queryFn: () => fetchCandidates({ data: { companyId, asOf } }),
  });
  const review = useMemo(
    () => reviewCapitalisableLines(candidates.data?.lines ?? [], currency),
    [candidates.data?.lines, currency],
  );
  const filtered = useMemo(
    () => selectCapitalisationReviewRows(review.rows, { status: filter, query: search, accountId }),
    [review.rows, filter, search, accountId],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const shown = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const exportCsv = () => {
    if (!candidates.data || candidates.isFetching || !asOf || asOf > today) return;
    const csv = capitalisationReviewCsv(filtered, asOf, currency);
    const url = URL.createObjectURL(
      new Blob(["\\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linkbooks-capitalisation-review-" + asOf + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const accounts = useMemo(() => {
    const found = new Map<string, { id: string; name: string; label: string; keywords: string }>();
    for (const line of review.rows) {
      if (!found.has(line.accountId)) {
        found.set(line.accountId, {
          id: line.accountId,
          name: line.accountName,
          label: line.accountCode + " · " + line.accountName,
          keywords: line.accountCode + " " + line.accountName,
        });
      }
    }
    return [...found.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [review.rows]);

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Review posted supplier-bill lines coded to non-control asset accounts. These are
          <strong> possible capital purchases</strong>, not confirmed missing fixed assets:
          inventory, deposits and prepayments can also use asset accounts. Registering an asset
          never posts its purchase journal. Do not create duplicate assets or adjustment entries
          without checking the bill, VAT/GST treatment and existing asset records.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="asset-purchases-as-of">Bills dated through</Label>
          <Input
            id="asset-purchases-as-of"
            type="date"
            max={today}
            value={asOf}
            className="w-44"
            onChange={(event) => {
              setAsOf(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="asset-purchases-status">Review status</Label>
          {/* lookup-fixed-enum: Review statuses, not business records. */}
          <select
            id="asset-purchases-status"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as Filter);
              setPage(0);
            }}
          >
            <option value="attention">Needs review</option>
            <option value="all">All asset-coded bill lines</option>
            <option value="unlinked">No asset linked</option>
            <option value="partially_linked">Partially linked</option>
            <option value="fx_review">Foreign currency</option>
            <option value="overlinked">Linked cost exceeds bill gross</option>
            <option value="non_purchase">Non-purchase amounts</option>
            <option value="linked">Already linked</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label>Asset-coded GL account</Label>
          <LookupSelect
            ariaLabel="Filter review by GL account"
            companyId={companyId}
            value={accountId}
            onChange={(value) => { setAccountId(value); setPage(0); }}
            options={accounts}
            placeholder="All accounts"
            searchPlaceholder="Search GL account"
            allowClear
          />
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search asset-coded purchases"
            className="pl-9"
            value={search}
            placeholder="Bill, supplier, description"
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!asOf || asOf > today || candidates.isFetching}
          onClick={() => void candidates.refetch()}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!candidates.data || candidates.isFetching || !asOf || asOf > today}
          onClick={exportCsv}
        >
          <Download className="mr-2 size-4" />
          Export filtered CSV
        </Button>
      </div>
      {!asOf || asOf > today ? (
        <Alert variant="destructive">
          <AlertDescription>Choose a date up to today.</AlertDescription>
        </Alert>
      ) : candidates.isPending ? (
        <LoadingState />
      ) : candidates.isError ? (
        <ErrorState
          title="Could not review asset-coded purchases"
          description={friendlyAuthError(candidates.error)}
          onRetry={() => void candidates.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Posted bill lines", value: review.totals.candidates },
              { label: "No asset linked", value: review.totals.unlinked },
              { label: "Partially linked", value: review.totals.partiallyLinked },
              {
                label: "Other review flags",
                value: review.totals.fxReview + review.totals.overlinked + review.totals.nonPurchase,
              },
            ].map((stat) => (
              <div className="rounded-lg border bg-card p-4" key={stat.label}>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-semibold tabular-nums">{fmt.number(stat.value)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length} matching line{filtered.length === 1 ? "" : "s"}; linked amounts
            represent the current asset register, not a historical snapshot. Bills are filtered
            by date, and foreign-currency bill values cannot be directly compared with base-currency
            registered costs. "Linked" means a relationship exists, not proof that capitalisation
            is complete or appropriate.
          </p>
          {filtered.length === 0 ? (
            <p className="rounded-lg border p-6 text-sm text-muted-foreground">
              No asset-coded posted bill lines match these filters.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill / date</TableHead>
                      <TableHead>Supplier / item</TableHead>
                      <TableHead>GL account</TableHead>
                      <TableHead className="text-right">Bill net</TableHead>
                      <TableHead className="text-right">Currently linked cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((line) => (
                      <TableRow key={line.lineId}>
                        <TableCell>
                          <Link
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            to="/purchases/bills/$billId"
                            params={{ billId: line.billId }}
                          >
                            {line.billNumber ?? "Open bill"}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {fmt.date(line.billDate)}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-48">
                          {line.supplier ?? "Supplier"}
                          <span className="block max-w-sm truncate text-xs text-muted-foreground">
                            {line.description}
                          </span>
                        </TableCell>
                        <TableCell>{line.accountCode} · {line.accountName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.amount(line.netMinor, line.currency)}
                          <span className="block text-xs text-muted-foreground">
                            {line.currency}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.amount(line.registeredMinor, currency)}
                          <span className="block text-xs text-muted-foreground">
                            {currency}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={line.status === "linked" ? "secondary" : "outline"}>
                            {STATUS_LABEL[line.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canManage || line.status === "non_purchase"}
                            onClick={() => onCreate(line)}
                            title="Review costs and link a new fixed asset; the bill will not be posted twice."
                          >
                            Review / add asset
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Page {currentPage + 1} of {pages} ({PAGE_SIZE} rows per page)
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
