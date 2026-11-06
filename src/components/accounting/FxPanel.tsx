import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  cancelAutoReversal,
  getFxOverview,
  previewFxRevaluation,
  postFxRevaluation,
  processDueAutoReversals,
  type RevaluationPreview,
} from "@/lib/accounting/fx.functions";
import {
  filterAutoReversals,
  fxRevaluationCsv,
  fxReviewSignature,
  localCalendarDate,
  type ReversalFilter,
} from "@/lib/accounting/fx-review";
import { isPositiveRate, nextDay } from "@/lib/accounting/fx-reval";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useFormat } from "@/hooks/use-format";
import { ErrorState, LoadingState } from "@/components/common/states";
import { FxRealisedLedgerAudit } from "@/components/accounting/FxRealisedLedgerAudit";
import { FxRevaluationLedgerAudit } from "@/components/accounting/FxRevaluationLedgerAudit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Foreign-currency gains and losses (AR-10) and auto-reversing journals (AC-05).
 * Rates are manual: nothing here fetches rates from the internet.
 */
export function FxPanel({ companyId, currency }: { companyId: string; currency: string }) {
  const qc = useQueryClient();
  const f = useFormat();
  const fetchOverview = useServerFn(getFxOverview);
  const doPreview = useServerFn(previewFxRevaluation);
  const doPost = useServerFn(postFxRevaluation);
  const doProcess = useServerFn(processDueAutoReversals);
  const doCancel = useServerFn(cancelAutoReversal);

  const today = localCalendarDate(new Date());
  const [asOf, setAsOf] = useState(today);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<RevaluationPreview | null>(null);
  const [reviewedInput, setReviewedInput] = useState("");
  const [reversalFilter, setReversalFilter] = useState<ReversalFilter>("due");

  const overview = useQuery({
    queryKey: ["fx-overview", companyId],
    queryFn: () => fetchOverview({ data: { companyId } }),
  });

  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: ["fx-overview", companyId] });
    await qc.invalidateQueries({ queryKey: ["journals", companyId] });
  };

  const previewM = useMutation({
    mutationFn: () => doPreview({ data: { companyId, asOfDate: asOf, rates } }),
    onSuccess: (r) => {
      setPreview(r);
      // Show the effective stored rates explicitly; the posting payload uses the reviewed values.
      const next = { ...rates };
      for (const line of r.lines) {
        if (next[line.currency_code] === undefined && line.rate != null) {
          next[line.currency_code] = String(line.rate);
        }
      }
      setRates(next);
      setReviewedInput(fxReviewSignature(companyId, asOf, next));
    },
    onError: (e) => {
      setPreview(null);
      setReviewedInput("");
      toast.error(friendlyAuthError(e));
    },
  });

  const postM = useMutation({
    mutationFn: () => {
      if (
        !preview ||
        !reviewedInput ||
        reviewedInput !== fxReviewSignature(companyId, asOf, rates)
      ) {
        throw new Error("Exchange rates have changed. Recalculate and review before posting.");
      }
      return doPost({ data: { companyId, asOfDate: asOf, rates, note } });
    },
    onSuccess: async (r) => {
      if (r.posted) {
        toast.success(`Revaluation posted. It reverses on ${f.date(r.reverse_on)}.`);
      } else {
        toast.message(r.message ?? "Nothing to revalue.");
      }
      setPreview(null);
      setReviewedInput("");
      await refreshAll();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const processM = useMutation({
    mutationFn: () => doProcess({ data: { companyId } }),
    onSuccess: async (r) => {
      if (r.failed > 0) toast.error(`${r.failed} reversal(s) failed. See the list for the reason.`);
      else toast.success(r.processed ? `${r.processed} reversal(s) posted` : "Nothing is due");
      await refreshAll();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const cancelM = useMutation({
    mutationFn: (journalId: string) => doCancel({ data: { companyId, journalId } }),
    onSuccess: async () => {
      toast.success("Auto-reversal cancelled");
      await refreshAll();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (overview.isPending) return <LoadingState />;
  if (overview.isError) {
    return (
      <ErrorState
        description={friendlyAuthError(overview.error)}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  const ov = overview.data;
  if (!ov.available) {
    return (
      <Alert>
        <AlertTitle>Unavailable</AlertTitle>
        <AlertDescription>{ov.unavailableReason}</AlertDescription>
      </Alert>
    );
  }

  const previewCurrent =
    preview !== null &&
    Boolean(reviewedInput) &&
    reviewedInput === fxReviewSignature(companyId, asOf, rates);
  const ratesComplete =
    preview !== null &&
    preview.lines.length > 0 &&
    [...new Set(preview.lines.map((l) => l.currency_code))].every((c) => isPositiveRate(rates[c]));
  const toAdjust = preview?.lines.filter((l) => (l.adjustment_minor ?? 0) !== 0).length ?? 0;
  const dueReversals = filterAutoReversals(ov.autoReversals, "due", today);
  const dueCount = dueReversals.length;
  const displayedReversals = filterAutoReversals(ov.autoReversals, reversalFilter, today);
  const exportPreview = () => {
    if (!preview || !previewCurrent) return;
    const csv = fxRevaluationCsv(preview);
    const url = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `linkbooks-fx-revaluation-preview-${asOf}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unrealised FX revaluation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Revalues open foreign-currency receivables, payables and foreign bank accounts to the
            rates below. Rates are entered by you (or taken from your stored rates in Settings);
            there is no live rate feed. Each journal reverses on the next day (
            {nextDay(asOf) ? f.date(nextDay(asOf)) : "—"}). Realised gains and losses on payments
            are posted automatically when a receipt or payment is allocated.
          </p>
          {ov.canPost ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="fx-asof">Revalue as at</Label>
                  <Input
                    id="fx-asof"
                    type="date"
                    max={today}
                    disabled={previewM.isPending || postM.isPending}
                    value={asOf}
                    onChange={(e) => {
                      setAsOf(e.target.value);
                      setPreview(null);
                      setReviewedInput("");
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={!asOf || previewM.isPending || postM.isPending}
                  onClick={() => previewM.mutate()}
                >
                  {previewM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {preview ? "Recalculate" : "Preview"}
                </Button>
              </div>

              {preview ? (
                preview.lines.length === 0 ? (
                  <p>
                    There are no open foreign-currency balances as at {f.date(preview.as_of_date)}.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="overflow-auto rounded-md border">
                      <table className="w-full">
                        <thead className="bg-muted text-left">
                          <tr>
                            <th className="p-2">Account</th>
                            <th className="p-2">Currency</th>
                            <th className="p-2 text-right">Balance</th>
                            <th className="p-2 text-right">Booked ({currency})</th>
                            <th className="p-2 text-right">At rate ({currency})</th>
                            <th className="p-2 text-right">Adjustment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.lines.map((l) => (
                            <tr key={`${l.account_id}-${l.currency_code}`} className="border-t">
                              <td className="p-2">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {l.account_code}
                                </span>{" "}
                                {l.account_name}
                              </td>
                              <td className="p-2">{l.currency_code}</td>
                              <td className="p-2 text-right tabular-nums">
                                {f.money(l.txn_net_minor, l.currency_code)}
                              </td>
                              <td className="p-2 text-right tabular-nums">
                                {f.money(l.booked_base_minor)}
                              </td>
                              <td className="p-2 text-right tabular-nums">
                                {l.closing_base_minor == null ? "—" : f.money(l.closing_base_minor)}
                              </td>
                              <td className="p-2 text-right tabular-nums">
                                {l.adjustment_minor == null
                                  ? "Rate needed"
                                  : f.money(l.adjustment_minor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {[...new Set(preview.lines.map((l) => l.currency_code))].map((c) => {
                        const line = preview.lines.find((l) => l.currency_code === c);
                        return (
                          <div key={c} className="space-y-1">
                            <Label htmlFor={`fx-rate-${c}`}>
                              1 {c} in {currency}
                            </Label>
                            <Input
                              id={`fx-rate-${c}`}
                              inputMode="decimal"
                              className="w-36"
                              value={rates[c] ?? ""}
                              disabled={previewM.isPending || postM.isPending}
                              onChange={(e) => setRates((cur) => ({ ...cur, [c]: e.target.value }))}
                            />
                            <p className="text-xs text-muted-foreground">
                              {line?.rate_source === "exchange_rates"
                                ? `Stored rate of ${f.date(line.rate_date)}${line.stale ? " (over a month old)" : ""}`
                                : line?.rate_source === "manual"
                                  ? "Entered by you"
                                  : "No stored rate: enter one"}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="max-w-md space-y-1">
                      <Label htmlFor="fx-note">Note (optional)</Label>
                      <Input id="fx-note" value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>

                    {preview.missing.length > 0 && !ratesComplete ? (
                      <p className="text-destructive">
                        Enter an exchange rate for {preview.missing.join(", ")}, then recalculate.
                      </p>
                    ) : null}
                    {toAdjust === 0 && ratesComplete ? (
                      <p>The balances already agree with these rates. Nothing to post.</p>
                    ) : null}
                    {!previewCurrent ? (
                      <p role="alert" className="text-sm text-destructive">
                        Rates or date changed after this preview. Recalculate before posting.
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        disabled={!previewCurrent || previewM.isPending || postM.isPending}
                        onClick={exportPreview}
                      >
                        Export preview CSV
                      </Button>
                      <Button
                        disabled={
                          !ratesComplete ||
                          !previewCurrent ||
                          toAdjust === 0 ||
                          previewM.isPending ||
                          postM.isPending
                        }
                        onClick={() => {
                          const message = `Post FX revaluation dated ${asOf}? ${toAdjust} account balance(s) require adjustment. Revaluation journals automatically reverse on ${nextDay(asOf) ?? "the following day"}.`;
                          if (window.confirm(message)) postM.mutate();
                        }}
                      >
                        {postM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                        Post revaluation
                      </Button>
                      <p className="self-center text-xs text-muted-foreground">
                        Recalculate after changing a rate to see the new adjustment.
                      </p>
                    </div>
                  </div>
                )
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">You can view revaluations but not post them.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            Auto-reversals
            {ov.canPost ? (
              <Button
                size="sm"
                variant="outline"
                disabled={processM.isPending}
                onClick={() => {
                  const message = `Process due auto-reversals now? ${dueCount} due items are visible in this overview. The server will determine all currently due journals and may post reversal entries.`;
                  if (window.confirm(message)) processM.mutate();
                }}
              >
                {processM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Process due reversals{dueCount ? ` (${dueCount})` : ""}
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Auto-reversing manual journals and revaluations wait here until their date. Nothing runs
            on its own inside the app: press the button, or have an administrator schedule{" "}
            <code>select public.process_due_auto_reversals_system();</code> daily (see the Wave 2 E
            notes).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="reversal-status">Show reversals</Label>
            <select
              id="reversal-status"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={reversalFilter}
              onChange={(event) => setReversalFilter(event.target.value as ReversalFilter)}
            >
              {/* lookup-fixed-enum: Fixed status filter, not business records. */}
              <option value="due">Due or overdue ({dueCount})</option>
              <option value="all">All recent reversals</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="done">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <span className="text-xs text-muted-foreground">
              {displayedReversals.length} of {ov.autoReversals.length} recent reversals shown.
            </span>
          </div>
          {displayedReversals.length === 0 ? (
            <p className="text-muted-foreground">
              No reversals match this filter. Choose All recent reversals to view history.
            </p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="w-full">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-2">Journal</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Reverses on</th>
                    <th className="p-2">Status</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {displayedReversals.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-2">
                        #{r.journal_number ?? "—"} {f.date(r.journal_date)}
                        {r.memo ? (
                          <div className="text-xs text-muted-foreground">{r.memo}</div>
                        ) : null}
                      </td>
                      <td className="p-2">
                        {r.origin === "fx_revaluation" ? "FX revaluation" : "Manual"}
                      </td>
                      <td className="p-2">{f.date(r.reverse_on)}</td>
                      <td className="p-2">
                        <Badge
                          variant={
                            r.status === "failed"
                              ? "destructive"
                              : r.status === "done"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {r.status}
                        </Badge>
                        {r.last_error ? (
                          <div className="text-xs text-destructive">{r.last_error}</div>
                        ) : null}
                      </td>
                      <td className="p-2 text-right">
                        {ov.canPost && (r.status === "pending" || r.status === "failed") ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={cancelM.isPending}
                            onClick={() => {
                              const message = `Cancel auto-reversal for journal #${r.journal_number ?? "unknown"} scheduled ${r.reverse_on}? The original journal remains posted.`;
                              if (window.confirm(message)) cancelM.mutate(r.journal_id);
                            }}
                          >
                            Cancel
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Realised FX on settlements</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {ov.realised.length === 0 ? (
            <p className="text-muted-foreground">
              None yet. A gain or loss is posted when a foreign-currency receipt or payment is
              allocated at a different rate from the invoice or bill.
            </p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="w-full">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">Settlement</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-right">Booked rate</th>
                    <th className="p-2 text-right">Settled rate</th>
                    <th className="p-2 text-right">Gain / (loss)</th>
                  </tr>
                </thead>
                <tbody>
                  {ov.realised.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{f.date(r.created_at)}</td>
                      <td className="p-2">
                        {r.kind === "sales" ? "Customer receipt" : "Supplier payment"}
                        {r.reversed_at ? " (reversed)" : ""}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {f.money(r.settled_minor, r.currency_code)}
                      </td>
                      <td className="p-2 text-right tabular-nums">{r.document_rate}</td>
                      <td className="p-2 text-right tabular-nums">{r.settlement_rate}</td>
                      <td className="p-2 text-right tabular-nums">
                        {f.money(r.gain_loss_base_minor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <FxRealisedLedgerAudit key={companyId} companyId={companyId} />

      {ov.runs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revaluation history</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1">
              {ov.runs.map((r) => (
                <li key={r.id}>
                  {f.date(r.as_of_date)} · gain {f.money(r.total_gain_minor)} · loss{" "}
                  {f.money(r.total_loss_minor)} · rates{" "}
                  {Object.entries(r.rates)
                    .map(([c, v]) => `${c} ${v}`)
                    .join(", ")}
                  {r.note ? ` · ${r.note}` : ""}
                  <FxRevaluationLedgerAudit companyId={companyId} runId={r.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
