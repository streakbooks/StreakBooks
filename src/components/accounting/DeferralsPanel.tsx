import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listDeferrals,
  createDeferral,
  postDeferral,
  cancelDeferral,
  type DeferralSchedule,
} from "@/lib/accounting/deferrals.functions";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { parseMinorOrThrow, tryParseMinor } from "@/lib/purchases/money-input";
import { toSafeMinorNumber } from "@/lib/accounting/money";
import {
  canPostDeferralEntry,
  deferralPageCounts,
  deferralScheduleReconciliation,
  deferralPageCsv,
  filterDeferralPage,
  previewDeferralSplit,
  type DeferralFilter,
} from "@/lib/accounting/deferral-review";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { AccountLookup } from "@/components/lookup";
import { DeferralLedgerAudit } from "@/components/accounting/DeferralLedgerAudit";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
export function DeferralsPanel({ companyId, currency }: { companyId: string; currency: string }) {
  const fmt = useFormat();
  const { can } = useCan();
  const qc = useQueryClient();
  const fetch = useServerFn(listDeferrals),
    create = useServerFn(createDeferral),
    post = useServerFn(postDeferral),
    cancel = useServerFn(cancelDeferral),
    accountsFn = useServerFn(listAccounts);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<"prepaid_expense" | "deferred_income">("prepaid_expense");
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [debit, setDebit] = useState("");
  const [credit, setCredit] = useState("");
  const [amount, setAmount] = useState("");
  const [start, setStart] = useState("");
  const [periods, setPeriods] = useState("12");
  const [postingDate, setPostingDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeferralFilter>("all");
  const request = useRef(crypto.randomUUID());
  const q = useQuery({
    queryKey: ["deferrals", companyId, page],
    queryFn: () => fetch({ data: { companyId, page } }),
  });
  const accounts = useQuery({
    queryKey: ["accounts", companyId],
    queryFn: () => accountsFn({ data: { companyId } }),
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["deferrals", companyId] }),
      qc.invalidateQueries({ queryKey: ["journals", companyId] }),
      qc.invalidateQueries({ queryKey: ["reports", companyId] }),
    ]);
  };
  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          companyId,
          requestId: request.current,
          kind,
          name,
          reference,
          debitAccountId: debit,
          creditAccountId: credit,
          totalMinor: toSafeMinorNumber(parseMinorOrThrow(amount, currency), "Deferral amount"),
          startDate: start,
          periods: Number(periods),
        },
      }),
    onSuccess: async (r) => {
      request.current = crypto.randomUUID();
      setCreating(false);
      setOpen(r.id);
      setPage(1);
      await refresh();
      toast.success("Deferral schedule created; no journal posted");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const postM = useMutation({
    mutationFn: (entryId: string) => {
      const schedule = q.data?.rows.find((s) =>
        s.deferral_entries.some((entry) => entry.id === entryId),
      );
      const entry = schedule?.deferral_entries.find((row) => row.id === entryId);
      const date = postingDate || q.data?.today || "";
      if (
        !entry ||
        !canPostDeferralEntry(entry, schedule?.status ?? "", q.data?.today ?? "", date)
      ) {
        throw new Error(
          "Recognition is not due or the posting date is invalid. Refresh the schedule.",
        );
      }
      return post({ data: { companyId, entryId, postingDate: date } });
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Recognition journal posted");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const cancelM = useMutation({
    mutationFn: (scheduleId: string) => cancel({ data: { companyId, scheduleId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Unposted schedule cancelled");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  if (q.isPending || accounts.isPending) return <LoadingState />;
  if (q.isError || accounts.isError)
    return (
      <QueryErrorState queries={[q, accounts]} title="Could not load deferrals" />
    );
  const active = (accounts.data ?? []).filter((a) => a.is_active && a.is_postable);
  const counts = deferralPageCounts(q.data.rows, q.data.today);
  const shown = filterDeferralPage(q.data.rows, statusFilter, q.data.today);
  const enteredAmount = tryParseMinor(amount, currency);
  const split =
    enteredAmount === null ? null : previewDeferralSplit(enteredAmount, Number(periods));
  const exportPage = () => {
    const csv = deferralPageCsv(q.data.rows);
    const url = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `streakbooks-deferrals-page-${page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const debitType = kind === "prepaid_expense" ? "expense" : "liability";
  const creditType = kind === "prepaid_expense" ? "asset" : "income";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Prepayments & deferred income</h2>
          <p className="text-sm text-muted-foreground">
            Monthly recognition in {currency}. Original bills/invoices must already be posted to the
            deferral account. Creating a schedule does not post the original balance.
          </p>
        </div>
        {can("accounting.post") ? (
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            New schedule
          </Button>
        ) : null}
      </div>
      {creating ? (
        <fieldset disabled={createM.isPending} className="space-y-4 rounded-md border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="deferral-kind">Schedule type</Label>
              <select
                className="block w-full rounded-md border bg-background p-2"
                id="deferral-kind"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as typeof kind);
                  setDebit("");
                  setCredit("");
                }}
              >
                {/* lookup-fixed-enum: Two supported recognition policies. */}
                <option value="prepaid_expense">Prepaid expense</option>
                <option value="deferred_income">Deferred income</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deferral-name">Name</Label>
              <Input
                id="deferral-name"
                value={name}
                maxLength={160}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deferral-reference">Original bill/invoice reference</Label>
              <Input
                id="deferral-reference"
                value={reference}
                maxLength={500}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deferral-amount">
                Amount to recognize ({currency}, excluding tax)
              </Label>
              <Input
                id="deferral-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deferral-start">First recognition date</Label>
              <Input
                id="deferral-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deferral-periods">Monthly periods (1–120)</Label>
              <Input
                id="deferral-periods"
                type="number"
                min={1}
                max={120}
                value={periods}
                onChange={(e) => setPeriods(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Debit: {kind === "prepaid_expense" ? "expense" : "deferred income liability"}
              </Label>
              <AccountLookup
                ariaLabel="Deferral debit account"
                companyId={companyId}
                accounts={active.filter((a) => a.account_type === debitType)}
                value={debit}
                onChange={setDebit}
                allowClear={false}
              />
            </div>
            <div className="space-y-2">
              <Label>Credit: {kind === "prepaid_expense" ? "prepayment asset" : "income"}</Label>
              <AccountLookup
                ariaLabel="Deferral credit account"
                companyId={companyId}
                accounts={active.filter((a) => a.account_type === creditType)}
                value={credit}
                onChange={setCredit}
                allowClear={false}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Equal monthly amounts, with rounding remainder in the final month. A short month uses
            its last day; later months return to the original day. Post each due entry after review.
          </p>
          {split ? (
            <p className="text-sm" role="status">
              Schedule preview: {fmt.money(split.regularMinor, currency)} in each earlier month,
              then {fmt.money(split.finalMinor, currency)} in the final month. Recognition dates are
              generated by the database when you create the schedule.
            </p>
          ) : amount || periods ? (
            <p className="text-xs text-muted-foreground">
              Enter a valid amount and 1–120 monthly periods to preview the split.
            </p>
          ) : null}
          <Button
            size="sm"
            disabled={
              createM.isPending ||
              !name.trim() ||
              !reference.trim() ||
              !debit ||
              !credit ||
              !start ||
              !amount
            }
            onClick={() => {
              const message = `Create a ${periods}-month ${kind === "prepaid_expense" ? "prepaid expense" : "deferred income"} schedule for ${amount} ${currency}? The original bill or invoice must already be posted to the deferral account.`;
              if (window.confirm(message)) createM.mutate();
            }}
          >
            Create schedule
          </Button>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="recognition-posting-date">Posting date for recognition</Label>
        <Input
          id="recognition-posting-date"
          className="w-auto"
          type="date"
          max={q.data.today}
          value={postingDate || q.data.today}
          onChange={(e) => setPostingDate(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          Use an open date on or after the scheduled date for catch-up. Period locks still apply.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label htmlFor="deferral-page-filter">Show schedules (current page)</Label>
          <select
            id="deferral-page-filter"
            value={statusFilter}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            onChange={(event) => setStatusFilter(event.target.value as DeferralFilter)}
          >
            {/* lookup-fixed-enum: Fixed schedule status filter, not business records. */}
            <option value="all">All on page</option>
            <option value="due">Due / overdue</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <span className="text-xs text-muted-foreground" role="status">
          {counts.dueEntries} due entries · {counts.reversedEntries} reversed entries.
        </span>
        <span className="text-xs text-muted-foreground">
          Showing {shown.length} of {counts.schedules} schedules on page {page}.
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={q.data.rows.length === 0}
          onClick={exportPage}
        >
          Export loaded page CSV
        </Button>
      </div>
      {shown.map((s) => (
        <section key={s.id} className="rounded-md border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              className="h-auto whitespace-normal text-left"
              onClick={() => setOpen(open === s.id ? null : s.id)}
            >
              {s.name} · {s.status} · {fmt.money(s.total_minor, currency)}
            </Button>
            <span className="text-xs text-muted-foreground">
              {s.reference} · {s.deferral_entries.filter((e) => e.journal_id).length}/{s.periods}{" "}
              entries posted
            </span>
          </div>
          <DeferralReconciliationSummary schedule={s} currency={currency} />
          {open === s.id ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Posting / journal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...s.deferral_entries]
                      .sort((a, b) => a.period_no - b.period_no)
                      .map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.period_no}</TableCell>
                          <TableCell>{fmt.date(e.due_on)}</TableCell>
                          <TableCell>{fmt.money(e.amount_minor, currency)}</TableCell>
                          <TableCell>
                            {e.journal_id ? (
                              <>
                                <Link
                                  className="text-primary underline"
                                  to="/accounting"
                                  search={{ tab: "journals", journal: e.journal_id }}
                                >
                                  View journal · {fmt.date(e.posted_on)}
                                </Link>
                                {e.journals?.reversed_by_journal_id ? (
                                  <p className="text-destructive">
                                    Journal reversed; review the accounting correction.
                                  </p>
                                ) : null}
                              </>
                            ) : s.status === "active" && can("accounting.post") ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  postM.isPending ||
                                  !canPostDeferralEntry(
                                    e,
                                    s.status,
                                    q.data.today,
                                    postingDate || q.data.today,
                                  )
                                }
                                onClick={() => {
                                  const message = `Post recognition of ${fmt.money(e.amount_minor, currency)} for ${s.name} (period ${e.period_no}) on ${postingDate || q.data.today}? This creates a ledger journal.`;
                                  if (window.confirm(message)) postM.mutate(e.id);
                                }}
                              >
                                Post recognition
                              </Button>
                            ) : (
                              "Unposted"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              <DeferralLedgerAudit companyId={companyId} scheduleId={s.id} />
              {s.status === "active" &&
              !s.deferral_entries.some((e) => e.journal_id) &&
              can("accounting.post") ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancelM.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancel this entirely unposted schedule? The history will remain.",
                      )
                    )
                      cancelM.mutate(s.id);
                  }}
                >
                  Cancel schedule
                </Button>
              ) : null}
            </>
          ) : null}
        </section>
      ))}
      {!q.data.rows.length ? (
        <p className="text-muted-foreground">No deferral schedules yet.</p>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground">
          No schedules match this filter on the current page. Choose All on page or navigate.
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} · {q.data.total} schedules
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page * 25 >= q.data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function DeferralReconciliationSummary({
  schedule,
  currency,
}: {
  schedule: DeferralSchedule;
  currency: string;
}) {
  const fmt = useFormat();
  const result = deferralScheduleReconciliation(schedule);
  if (!result) {
    return (
      <p className="mt-2 text-xs text-destructive" role="alert">
        Unsafe schedule amount detected. Reconciliation unavailable.
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>Recognized: {fmt.money(result.recognized, currency)}</span>
      <span>Unposted: {fmt.money(result.unposted, currency)}</span>
      {result.reversed !== 0n ? (
        <span className="text-destructive">Reversed: {fmt.money(result.reversed, currency)}</span>
      ) : null}
      {result.difference !== 0n || !result.entryCountMatches ? (
        <span className="text-destructive" role="alert">
          Schedule mismatch: allocated difference {fmt.money(result.difference, currency)};{" "}
          {schedule.deferral_entries.length} of {schedule.periods} periods loaded. Review before
          posting.
        </span>
      ) : null}
    </div>
  );
}
