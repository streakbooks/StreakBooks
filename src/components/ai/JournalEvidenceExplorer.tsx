import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpenText, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getJournalReport, getAccountTransactions } from "@/lib/reports/report.functions";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { todayIso, monthStart } from "@/lib/accounting/fiscal-year";
import { isReportDate } from "@/lib/reports/date-validation";
import { fromMinorUnits } from "@/lib/accounting/money";
import { SOURCE_LABELS, sourceLabel } from "@/lib/reports/links";
import { JournalLink, SourceLink } from "@/components/reports/ReportShell";
import { AiJournalExplanationDialog } from "@/components/ai/JournalExplanationDialog";
import { saveAiJournalReview } from "@/lib/ai/review-queue.functions";
import {
  assessAccountEvidenceLine,
  assessJournalEvidence,
  summariseJournalEvidence,
} from "@/lib/ai/evidence-review";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const pageSize = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type InvestigationMode = "journals" | "account";
type FilterRange = { from: string; to: string };
const initialDay = todayIso();
const initialRange: FilterRange = { from: monthStart(initialDay), to: initialDay };

function evidenceMoney(value: number | bigint | null, currency: string): string {
  if (value === null) return "Exact amount unavailable";
  if (typeof value === "number" && !Number.isSafeInteger(value)) return "Exact amount unavailable";
  const amount = typeof value === "bigint" ? value : BigInt(value);
  return currency + " " + fromMinorUnits(amount, currency);
}

/**
 * Read-only evidence explorer. It reuses the same permission-checked ledger and
 * reporting server APIs as the Reports Centre, not a model-generated replica.
 */
export function AiJournalEvidenceExplorer({
  companyId,
  currency,
  canUse,
  canViewReports,
}: {
  companyId: string;
  currency: string;
  canUse: boolean;
  canViewReports: boolean;
}) {
  const fetchJournals = useServerFn(getJournalReport);
  const fetchTransactions = useServerFn(getAccountTransactions);
  const fetchAccounts = useServerFn(listAccounts);
  const saveReview = useServerFn(saveAiJournalReview);
  const qc = useQueryClient();
  const createReviewM = useMutation({
    mutationFn: (journalId: string) =>
      saveReview({
        data: {
          companyId,
          journalId,
          caseId: null,
          expectedVersion: null,
          action: "open",
          note: "",
          assignedTo: null,
        },
      }),
    onSuccess: async () => {
      toast.success("Journal added to the persistent AI review queue.");
      await qc.invalidateQueries({ queryKey: ["ai-journal-review-cases", companyId] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not create the AI journal review.",
      ),
  });

  const [mode, setMode] = useState<InvestigationMode>("journals");
  const [draft, setDraft] = useState<FilterRange>(initialRange);
  const [range, setRange] = useState<FilterRange>(initialRange);
  const [source, setSource] = useState("");
  const [accountId, setAccountId] = useState("");
  const [journalPage, setJournalPage] = useState(0);
  const [accountPage, setAccountPage] = useState(0);
  const [explainJournalId, setExplainJournalId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const validDates = isReportDate(range.from) && isReportDate(range.to) && range.from <= range.to;
  const allowed = canUse && canViewReports && validDates;

  const journalsQ = useQuery({
    queryKey: ["ai-evidence-journals", companyId, range.from, range.to, source, journalPage],
    enabled: allowed && mode === "journals",
    queryFn: () =>
      fetchJournals({
        data: {
          companyId,
          from: range.from,
          to: range.to,
          source,
          status: "posted",
          page: journalPage,
          pageSize,
        },
      }),
    staleTime: 30_000,
  });
  const accountsQ = useQuery({
    queryKey: ["ai-evidence-accounts", companyId],
    enabled: allowed && mode === "account",
    queryFn: () => fetchAccounts({ data: { companyId } }),
  });
  const accountQ = useQuery({
    queryKey: ["ai-evidence-account", companyId, range.from, range.to, accountId, accountPage],
    enabled: allowed && mode === "account" && Boolean(accountId),
    queryFn: () =>
      fetchTransactions({
        data: {
          companyId,
          accountId,
          from: range.from,
          to: range.to,
          page: accountPage,
          pageSize,
          sort: "date_asc",
        },
      }),
    staleTime: 30_000,
  });

  if (!canUse) return null;
  const evidence = journalsQ.data;
  const summary = evidence ? summariseJournalEvidence(evidence.rows) : null;
  const transactions = accountQ.data;
  const selectedAccount = (accountsQ.data ?? []).find((account) => account.id === accountId);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isReportDate(draft.from) || !isReportDate(draft.to) || draft.from > draft.to) {
      setError("Choose valid calendar dates with the end date on or after the start date.");
      return;
    }
    setError("");
    setJournalPage(0);
    setAccountPage(0);
    setRange({ ...draft });
  }

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpenText className="size-4" /> Accounting evidence explorer
          <Badge variant="secondary">Posted ledger · read-only</Badge>
        </CardTitle>
        <CardDescription>
          Investigate actual posted journals and account movements, trace them to LinkBooks records,
          and review deterministic integrity signals. Nothing is posted or changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canViewReports ? (
          <Alert>
            <ShieldCheck className="size-4" />
            <AlertTitle>Reports View permission required</AlertTitle>
            <AlertDescription>
              Your role needs reporting access in addition to AI access to investigate posted
              journals and general-ledger transactions.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Accounting investigation type"
            >
              <Button
                type="button"
                variant={mode === "journals" ? "default" : "outline"}
                aria-pressed={mode === "journals"}
                onClick={() => setMode("journals")}
              >
                Posted journals
              </Button>
              <Button
                type="button"
                variant={mode === "account" ? "default" : "outline"}
                aria-pressed={mode === "account"}
                onClick={() => setMode("account")}
              >
                Account transactions
              </Button>
            </div>
            <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ai-evidence-from">From</Label>
                <Input
                  id="ai-evidence-from"
                  type="date"
                  required
                  className="w-44"
                  value={draft.from}
                  onChange={(event) => setDraft((old) => ({ ...old, from: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-evidence-to">To</Label>
                <Input
                  id="ai-evidence-to"
                  type="date"
                  required
                  className="w-44"
                  value={draft.to}
                  onChange={(event) => setDraft((old) => ({ ...old, to: event.target.value }))}
                />
              </div>
              <Button type="submit" variant="outline">
                Apply dates
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={journalsQ.isFetching || accountQ.isFetching}
                onClick={() => {
                  void qc.invalidateQueries({ queryKey: ["ai-evidence-journals", companyId] });
                  void qc.invalidateQueries({ queryKey: ["ai-evidence-account", companyId] });
                  void qc.invalidateQueries({ queryKey: ["ai-evidence-accounts", companyId] });
                }}
              >
                <RefreshCw className="size-4" /> Refresh
              </Button>
            </form>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {mode === "journals" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-evidence-source">Journal source</Label>
                    <RecordLookupSelect
                      id="ai-evidence-source"
                      className="flex h-10 w-60 max-w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={source}
                      onValueChange={(event) => {
                        setSource(event);
                        setJournalPage(0);
                      }}
                    >
                      <option value="">All posted journal sources</option>
                      {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </RecordLookupSelect>
                  </div>
                  <Link
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    to="/reports/$reportId"
                    params={{ reportId: "journal-report" }}
                    search={{
                      from: range.from,
                      to: range.to,
                      status: "posted",
                      ...(source ? { source } : {}),
                    }}
                  >
                    Open matching Journal Report
                  </Link>
                </div>
                {journalsQ.isPending ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Loading posted journal evidence…
                  </p>
                ) : journalsQ.isError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Journal evidence unavailable</AlertTitle>
                    <AlertDescription>
                      {friendlyAuthError(journalsQ.error)}{" "}
                      <Button variant="outline" size="sm" onClick={() => void journalsQ.refetch()}>
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : evidence && summary ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Showing {summary.displayed} posted journals on this page of {evidence.total}{" "}
                      matching entries.
                      {summary.singleCurrency && summary.pageDebit !== null
                        ? " Displayed-page debit: " +
                          evidenceMoney(summary.pageDebit, summary.singleCurrency) +
                          "; credit: " +
                          evidenceMoney(summary.pageCredit, summary.singleCurrency) +
                          "."
                        : " Displayed-page combined totals are omitted where currencies differ or exact values cannot be verified."}{" "}
                      These are not full-ledger totals.
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary">
                        {summary.balanced} with equal debit/credit totals
                      </Badge>
                      {summary.review > 0 ? (
                        <Badge variant="destructive">{summary.review} needing totals review</Badge>
                      ) : null}
                      {summary.unavailable > 0 ? (
                        <Badge variant="outline">{summary.unavailable} totals not verifiable</Badge>
                      ) : null}
                    </div>
                    {evidence.rows.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                        No posted journals match the selected period and source.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Journal</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Memo and evidence check</TableHead>
                              <TableHead className="text-right">Debit</TableHead>
                              <TableHead className="text-right">Credit</TableHead>
                              <TableHead>Explanation</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {evidence.rows.map((item) => {
                              const check = assessJournalEvidence(item);
                              return (
                                <TableRow key={item.journal_id}>
                                  <TableCell className="whitespace-nowrap">
                                    <JournalLink
                                      journalId={item.journal_id}
                                      number={item.journal_number}
                                    />
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-xs">
                                    {item.journal_date}
                                  </TableCell>
                                  <TableCell>
                                    <SourceLink type={item.source_type} id={item.source_id} />
                                  </TableCell>
                                  <TableCell className="min-w-48 max-w-96 text-xs">
                                    <p className="break-words">{item.memo ?? "No memo recorded"}</p>
                                    <details className="mt-1">
                                      <summary
                                        className={
                                          check.status === "review_totals"
                                            ? "cursor-pointer text-destructive"
                                            : "cursor-pointer text-muted-foreground"
                                        }
                                      >
                                        {check.status === "balanced_totals"
                                          ? "Reported totals equal"
                                          : "Review evidence"}
                                      </summary>
                                      <p className="mt-1 text-muted-foreground">
                                        {check.explanation}
                                      </p>
                                      <p className="mt-1 text-muted-foreground">
                                        Source type: {sourceLabel(item.source_type)}
                                      </p>
                                    </details>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                                    {evidenceMoney(check.debit, item.currency_code || currency)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                                    {evidenceMoney(check.credit, item.currency_code || currency)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setExplainJournalId(item.journal_id)}
                                      >
                                        Explain journal
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={createReviewM.isPending}
                                        onClick={() => createReviewM.mutate(item.journal_id)}
                                      >
                                        Add to review queue
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">
                        Page {journalPage + 1} of{" "}
                        {Math.max(1, Math.ceil(evidence.total / pageSize))}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={journalPage === 0 || journalsQ.isFetching}
                          onClick={() => setJournalPage((p) => Math.max(0, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            (journalPage + 1) * pageSize >= evidence.total || journalsQ.isFetching
                          }
                          onClick={() => setJournalPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-evidence-account">Ledger account</Label>
                    <RecordLookupSelect
                      id="ai-evidence-account"
                      className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
                      value={accountId}
                      onValueChange={(event) => {
                        setAccountId(event);
                        setAccountPage(0);
                      }}
                    >
                      <option value="">Choose an account to investigate</option>
                      {(accountsQ.data ?? []).map((account) => (
                        <option value={account.id} key={account.id}>
                          {account.code} — {account.name}
                          {!account.is_active ? " (inactive)" : ""}
                        </option>
                      ))}
                    </RecordLookupSelect>
                  </div>
                  {selectedAccount ? (
                    <Link
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      to="/reports/$reportId"
                      params={{ reportId: "general-ledger" }}
                      search={{
                        account: accountId,
                        from: range.from,
                        to: range.to,
                        ...(transactions ? { basis: transactions.accountingBasis } : {}),
                      }}
                    >
                      Open Account Transactions report
                    </Link>
                  ) : null}
                </div>
                {accountsQ.isPending ? (
                  <p className="text-sm text-muted-foreground">
                    Loading permitted chart of accounts…
                  </p>
                ) : accountsQ.isError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Accounts unavailable</AlertTitle>
                    <AlertDescription>
                      {friendlyAuthError(accountsQ.error)}{" "}
                      <Button variant="outline" size="sm" onClick={() => void accountsQ.refetch()}>
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : !accountId ? (
                  <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                    Select an account to inspect the exact posted movements returned by its
                    general-ledger report.
                  </p>
                ) : accountQ.isPending ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Loading account evidence…
                  </p>
                ) : accountQ.isError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Account evidence unavailable</AlertTitle>
                    <AlertDescription>
                      {friendlyAuthError(accountQ.error)}{" "}
                      <Button variant="outline" size="sm" onClick={() => void accountQ.refetch()}>
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : transactions ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Opening balance · {transactions.accountingBasis}
                        </p>
                        <p className="font-semibold tabular-nums">
                          {evidenceMoney(transactions.opening_balance_minor, currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Closing balance · {transactions.accountingBasis}
                        </p>
                        <p className="font-semibold tabular-nums">
                          {evidenceMoney(transactions.closing_balance_minor, currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Movements matching selected dates
                        </p>
                        <p className="font-semibold tabular-nums">{transactions.total_count}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The opening/closing balances are reported for the full selected period, while
                      the rows below are just one page. The account's normal-balance convention is
                      used for displayed running balances. Do not add movements across pages without
                      reviewing the full report.
                    </p>
                    {transactions.rows.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                        No posted movements in the selected period.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Journal</TableHead>
                              <TableHead>Description / source</TableHead>
                              <TableHead className="text-right">Debit</TableHead>
                              <TableHead className="text-right">Credit</TableHead>
                              <TableHead className="text-right">Running balance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transactions.rows.map((row) => {
                              const check = assessAccountEvidenceLine(row);
                              return (
                                <TableRow key={row.line_id}>
                                  <TableCell className="whitespace-nowrap text-xs">
                                    {row.journal_date}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    <JournalLink
                                      journalId={row.journal_id}
                                      number={row.journal_number}
                                    />
                                    {UUID.test(row.journal_id) ? (
                                      <>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setExplainJournalId(row.journal_id)}
                                        >
                                          Explain
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          disabled={createReviewM.isPending}
                                          onClick={() => createReviewM.mutate(row.journal_id)}
                                        >
                                          Add to review queue
                                        </Button>
                                      </>
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="min-w-48 max-w-96 text-xs">
                                    <p className="break-words">
                                      {row.description || row.memo || "No description recorded"}
                                    </p>
                                    <SourceLink type={row.source_type} id={row.source_id} />
                                    {check.status !== "ordinary" ? (
                                      <p className="mt-1 text-destructive">{check.explanation}</p>
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                                    {check.status === "unavailable"
                                      ? "Unavailable"
                                      : evidenceMoney(row.debit_minor, currency)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                                    {check.status === "unavailable"
                                      ? "Unavailable"
                                      : evidenceMoney(row.credit_minor, currency)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                                    {check.status === "unavailable"
                                      ? "Unavailable"
                                      : evidenceMoney(row.running_balance_minor, currency)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">
                        Page {accountPage + 1} of{" "}
                        {Math.max(1, Math.ceil(transactions.total_count / pageSize))}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={accountPage === 0 || accountQ.isFetching}
                          onClick={() => setAccountPage((p) => Math.max(0, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            (accountPage + 1) * pageSize >= transactions.total_count ||
                            accountQ.isFetching
                          }
                          onClick={() => setAccountPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Evidence is scoped to the active organisation and your reporting permissions. An equal
              journal debit/credit total does not prove an entry is correctly coded, documented or
              reconciled. Source links lead to original records for human review. This view does not
              send journal or transaction details to an external AI provider.
            </p>
          </>
        )}
        <AiJournalExplanationDialog
          key={explainJournalId ?? "closed"}
          companyId={companyId}
          journalId={explainJournalId}
          open={Boolean(explainJournalId) && canUse && canViewReports}
          onOpenChange={(open) => {
            if (!open) setExplainJournalId(null);
          }}
        />
      </CardContent>
    </Card>
  );
}
