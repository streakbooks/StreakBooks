import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Download, Loader2, Plus, RotateCcw, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { BudgetGovernancePanel } from "@/components/budgets/BudgetGovernancePanel";
import { BudgetApprovalPanel } from "@/components/budgets/BudgetApprovalPanel";
import { BudgetDimensionsPanel } from "@/components/budgets/BudgetDimensionsPanel";
import { BudgetForecastPanel } from "@/components/budgets/BudgetForecastPanel";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { addMonthsIso, monthStart } from "@/lib/accounting/fiscal-year";
import { fromMinorUnits } from "@/lib/accounting/money";
import {
  getBudget,
  getBudgetApproval,
  getBudgetGovernance,
  getYearActuals,
  saveBudgetDocument,
} from "@/lib/budgets/budgets.functions";
import {
  applyUpliftBps,
  fillRight,
  monthLabel,
  spreadEvenly,
  sumMinorNumbers,
} from "@/lib/budgets/budget-math";
import { summarizeBudgetGrid } from "@/lib/budgets/budget-grid-summary";
import { preparePriorYearActualsDraft } from "@/lib/budgets/budget-prior-year";
import {
  budgetCsvHeaders,
  budgetToCsvRows,
  parseAmountCell,
  parseBudgetCsv,
} from "@/lib/budgets/budget-csv";
import { csvFilename, downloadCsv, toCsv } from "@/lib/reports/csv";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountLookup } from "@/components/lookup";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/budgets/$budgetId")({
  head: () => ({ meta: [{ title: "Budget — LinkBooks" }] }),
  component: BudgetEditorPage,
});

type BudgetData = Awaited<ReturnType<typeof getBudget>>;

function BudgetEditorPage() {
  const { budgetId } = Route.useParams();
  const { company } = useActiveCompany();
  const fetchFn = useServerFn(getBudget);
  const companyId = company?.id;
  const query = useQuery({
    queryKey: ["budget", companyId, budgetId],
    enabled: Boolean(companyId),
    queryFn: () => fetchFn({ data: { companyId: companyId!, budgetId } }),
  });
  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load budget"
        description={friendlyAuthError(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  // Re-mount after every save so the grid always reflects what is stored.
  return (
    <BudgetEditor
      key={`${query.data.budget.id}-${query.data.budget.updated_at}`}
      companyId={companyId}
      data={query.data}
    />
  );
}

/** Text typed in the grid per account; converted to minor units only when needed. */
type Cells = Record<string, string[]>;

function toText(minor: number, currency: string): string {
  return minor === 0 ? "" : fromMinorUnits(minor, currency);
}

function parseCell(text: string, currency: string): number | null {
  try {
    return parseAmountCell(text, currency);
  } catch {
    return null;
  }
}

function BudgetEditor({ companyId, data }: { companyId: string; data: BudgetData }) {
  const { company } = useActiveCompany();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const canManage = useCanDo("accounts.manage");
  const currency = data.currency;
  const saveDocumentFn = useServerFn(saveBudgetDocument);
  const actualsFn = useServerFn(getYearActuals);
  const governanceFn = useServerFn(getBudgetGovernance);
  const approvalFn = useServerFn(getBudgetApproval);
  const approvalQuery = useQuery({
    queryKey: ["budget-approval", companyId, data.budget.id],
    queryFn: () => approvalFn({ data: { companyId, budgetId: data.budget.id } }),
  });
  const governanceQuery = useQuery({
    queryKey: ["budget-governance", companyId, data.budget.id],
    queryFn: () => governanceFn({ data: { companyId, budgetId: data.budget.id } }),
  });
  const locked = governanceQuery.data?.locked === true;
  const approvalFrozen =
    approvalQuery.data?.status === "pending" || approvalQuery.data?.status === "approved";
  const canEdit =
    canManage &&
    !governanceQuery.isPending &&
    !governanceQuery.isError &&
    !approvalQuery.isPending &&
    !approvalQuery.isError &&
    !locked &&
    !approvalFrozen;
  const fileRef = useRef<HTMLInputElement>(null);

  const initial = useMemo(() => {
    const idx = new Map(data.months.map((m, i) => [m, i]));
    const out: Cells = {};
    for (const l of data.lines) {
      const i = idx.get(l.month);
      if (i === undefined) continue;
      const row = (out[l.accountId] ??= Array.from({ length: 12 }, () => ""));
      row[i] = toText(l.amountMinor, currency);
    }
    return out;
  }, [data, currency]);

  const [cells, setCells] = useState<Cells>(initial);
  const [dirty, setDirty] = useState(false);
  const [saveConflict, setSaveConflict] = useState(false);
  const [name, setName] = useState(data.budget.name);
  const [notes, setNotes] = useState(data.budget.notes ?? "");
  const [accountSearch, setAccountSearch] = useState("");
  const [annualDrafts, setAnnualDrafts] = useState<Record<string, string>>({});
  const [uplift, setUplift] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [addId, setAddId] = useState("");
  const focus = useRef<Record<string, number>>({});

  const accounts = data.accounts;
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const rowIds = new Set(Object.keys(cells).filter((id) => byId.has(id)));
  const rows = accounts.filter((a) => rowIds.has(a.id));
  const available = accounts.filter((a) => !rowIds.has(a.id));
  const hiddenLineCount = data.lines.filter((line) => !byId.has(line.accountId)).length;

  const minor = (id: string): Array<number | null> =>
    (cells[id] ?? []).map((t) => parseCell(t, currency));
  const invalidCount = rows.reduce((n, a) => n + minor(a.id).filter((v) => v === null).length, 0);
  const invalidAnnualCount = rows.filter(
    (a) => annualDrafts[a.id] !== undefined && parseCell(annualDrafts[a.id]!, currency) === null,
  ).length;
  const invalidAmountCount = invalidCount + invalidAnnualCount;
  const unappliedAnnualCount = Object.keys(annualDrafts).length;
  const visible = (a: (typeof rows)[number]) =>
    `${a.code} ${a.name}`.toLocaleLowerCase().includes(accountSearch.trim().toLocaleLowerCase());

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const update = (next: Cells) => {
    setCells(next);
    setDirty(true);
  };
  const setRow = (id: string, row: string[]) => update({ ...cells, [id]: row });
  const rowOf = (id: string) => cells[id] ?? Array.from({ length: 12 }, () => "");

  // A grid preview is not permitted to silently round whole minor units.
  // Catch overflow for a visible warning rather than crashing the editor.
  const gridSummary = (() => {
    try {
      return {
        totals: summarizeBudgetGrid(
          rows.map((a) => ({ id: a.id, kind: a.kind, months: minor(a.id) })),
          data.months.length,
        ),
        error: null as string | null,
      };
    } catch (error) {
      return { totals: null, error: friendlyAuthError(error) };
    }
  })();
  const totalsError = gridSummary.error;
  const hasInvalidAmounts = invalidAmountCount > 0 || totalsError !== null;
  const incomeTotals = gridSummary.totals?.incomeMonths ?? data.months.map(() => 0);
  const expenseTotals = gridSummary.totals?.expenseMonths ?? data.months.map(() => 0);
  const netTotals = gridSummary.totals?.netMonths ?? data.months.map(() => 0);
  const sum = (xs: number[]) => sumMinorNumbers(xs);
  const budgetNetMinor = gridSummary.totals?.netYear ?? 0;

  const applyMinor = (fn: (id: string, v: number[]) => number[]) => {
    if (hasInvalidAmounts) {
      toast.error("Fix invalid amounts before applying a bulk adjustment.");
      return false;
    }
    const next: Cells = {};
    for (const a of rows) {
      const parsed = minor(a.id).map((v) => v ?? 0);
      next[a.id] = fn(a.id, parsed).map((v) => toText(v, currency));
    }
    setAnnualDrafts({});
    update(next);
    return true;
  };

  const onUplift = () => {
    const pct = Number(uplift);
    if (!uplift.trim() || !Number.isFinite(pct) || pct <= -100 || pct > 10000) {
      toast.error("Enter an uplift percentage, e.g. 5 or -2.5");
      return;
    }
    const bps = Math.round(pct * 100);
    try {
      if (applyMinor((_, v) => v.map((x) => applyUpliftBps(x, bps)))) {
        toast.success(`Applied ${pct}% to every row (not saved yet)`);
      }
    } catch (error) {
      toast.error(friendlyAuthError(error));
    }
  };

  const onCopyActuals = async () => {
    if (hiddenLineCount > 0) {
      toast.error(
        "Existing budget has archived account amounts. Resolve those accounts before copying.",
      );
      return;
    }
    if (
      rows.length > 0 &&
      !window.confirm(
        "Replace all account rows with last year's actuals? Unsaved amounts will be lost.",
      )
    )
      return;
    try {
      const prior = addMonthsIso(monthStart(data.budget.fiscal_year_start), -12);
      const res = await actualsFn({ data: { companyId, fiscalYearStart: prior } });
      if (res.rows.length === 0) {
        toast.info("There are no posted actuals for the previous year.");
        return;
      }
      // Validate the complete prior-year set before changing the editor.
      // An archived P&L account must never be silently omitted from a copy.
      const validated = preparePriorYearActualsDraft(
        accounts.map((account) => account.id),
        res.rows,
      );
      const next: Cells = {};
      for (const [accountId, amounts] of Object.entries(validated)) {
        next[accountId] = amounts.map((value) => toText(value, currency));
      }
      setAnnualDrafts({});
      update(next);
      toast.success("Copied last year's actuals (not saved yet). Apply an uplift if you want one.");
    } catch (e) {
      toast.error(friendlyAuthError(e));
    }
  };

  const onExport = () => {
    if (hiddenLineCount > 0) {
      toast.error("Export blocked: archived account amounts would be omitted.");
      return;
    }
    if (hasInvalidAmounts) {
      toast.error("Fix invalid amounts before exporting the budget.");
      return;
    }
    const values = new Map(rows.map((a) => [a.id, minor(a.id).map((v) => v ?? 0)]));
    const text = toCsv(
      {
        company: company?.name ?? "",
        report: `Budget ${data.budget.name}`,
        period: `Financial year from ${data.budget.fiscal_year_start}`,
        currency,
      },
      budgetCsvHeaders(data.months),
      budgetToCsvRows(rows, values, currency),
    );
    downloadCsv(csvFilename(`budget-${data.budget.name}`, data.budget.fiscal_year_start), text);
  };

  const onImport = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Budget CSV files must be 5 MB or smaller.");
      return;
    }
    if (
      dirty &&
      !window.confirm(
        "Import into this unsaved budget draft? Matching account amounts will be replaced.",
      )
    )
      return;
    let res: ReturnType<typeof parseBudgetCsv>;
    try {
      res = parseBudgetCsv(await file.text(), accounts, currency, data.months);
    } catch (error) {
      toast.error(friendlyAuthError(error));
      return;
    }
    if (res.issues.length > 0) {
      setIssues(res.issues.slice(0, 20).map((i) => `Row ${i.row}: ${i.message}`));
      toast.error("The file has problems, nothing was imported.");
      return;
    }
    setIssues([]);
    const next: Cells = { ...cells };
    for (const [id, vals] of res.values) next[id] = vals.map((v) => toText(v, currency));
    setAnnualDrafts({});
    update(next);
    toast.success(`Imported ${res.values.size} account rows (not saved yet)`);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!canEdit) throw new Error("You cannot edit a locked or unavailable budget.");
      if (hasInvalidAmounts) throw new Error("Fix the highlighted amounts first.");
      if (unappliedAnnualCount > 0) {
        throw new Error("Apply annual totals using Enter or blur before saving.");
      }
      if (hiddenLineCount > 0) {
        throw new Error("This budget has archived account amounts. Resolve them before saving.");
      }
      return saveDocumentFn({
        data: {
          companyId,
          budgetId: data.budget.id,
          name: name.trim(),
          notes: notes.trim() || null,
          expectedUpdatedAt: data.budget.updated_at,
          rows: rows.map((a) => ({
            accountId: a.id,
            months: minor(a.id).map((value) => value ?? 0),
          })),
        },
      });
    },
    onSuccess: async () => {
      setDirty(false);
      setSaveConflict(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["budget", companyId, data.budget.id] }),
        queryClient.invalidateQueries({ queryKey: ["budgets", companyId] }),
        queryClient.invalidateQueries({
          queryKey: ["budget-governance", companyId, data.budget.id],
        }),
      ]);
      toast.success("Budget saved atomically");
    },
    onError: (error) => {
      const message = friendlyAuthError(error);
      if (message.includes("changed since it was opened")) setSaveConflict(true);
      toast.error(message);
    },
  });

  const income = rows.filter((a) => a.kind === "income");
  const expense = rows.filter((a) => a.kind === "expense");
  const resetDraft = () => {
    if (dirty && !window.confirm("Discard the unsaved changes to this budget?")) return;
    setCells(initial);
    setName(data.budget.name);
    setNotes(data.budget.notes ?? "");
    setIssues([]);
    setAnnualDrafts({});
    setDirty(false);
    setSaveConflict(false);
    toast.info("Budget restored to the last saved version.");
  };

  const renderRow = (a: (typeof rows)[number]) => {
    const row = rowOf(a.id);
    const vals = minor(a.id);
    let total: number | null;
    try {
      total = sumMinorNumbers(vals.map((v) => v ?? 0));
    } catch {
      total = null;
    }
    return (
      <TableRow key={a.id}>
        <TableCell className="sticky left-0 z-10 min-w-48 bg-background">
          <span className="mr-2 text-muted-foreground">{a.code}</span>
          {a.name}
        </TableCell>
        {data.months.map((m, i) => (
          <TableCell key={m} className="p-1">
            <Input
              aria-label={`${a.name} ${monthLabel(m)}`}
              className="h-8 w-24 text-right tabular-nums"
              inputMode="decimal"
              value={row[i] ?? ""}
              aria-invalid={vals[i] === null}
              disabled={!canEdit}
              onFocus={() => {
                focus.current[a.id] = i;
              }}
              onChange={(e) => {
                const r = [...row];
                r[i] = e.target.value;
                setRow(a.id, r);
              }}
            />
          </TableCell>
        ))}
        <TableCell className="p-1">
          <Input
            aria-label={`${a.name} annual total (spreads evenly)`}
            className="h-8 w-28 text-right font-medium tabular-nums"
            inputMode="decimal"
            disabled={!canEdit}
            value={
              annualDrafts[a.id] ??
              (total === null || total === 0 ? "" : fromMinorUnits(total, currency))
            }
            aria-invalid={
              total === null ||
              (annualDrafts[a.id] !== undefined &&
                parseCell(annualDrafts[a.id]!, currency) === null)
            }
            onChange={(event) => {
              setAnnualDrafts((prev) => ({ ...prev, [a.id]: event.target.value }));
              setDirty(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            onBlur={() => {
              const text = annualDrafts[a.id];
              if (text === undefined) return;
              const value = parseCell(text, currency);
              if (value === null) {
                toast.error(`Enter a valid annual amount for ${a.name}.`);
                return;
              }
              setRow(
                a.id,
                spreadEvenly(value, 12).map((x) => toText(x, currency)),
              );
              setAnnualDrafts((prev) => {
                const next = { ...prev };
                delete next[a.id];
                return next;
              });
            }}
            title="Enter an annual amount, then press Enter or leave the field to distribute it across the year"
          />
        </TableCell>
        <TableCell className="whitespace-nowrap p-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={!canEdit}
            title="Copy the amount in the cell you last edited into every later month"
            onClick={() => {
              const from = focus.current[a.id] ?? 0;
              if (hasInvalidAmounts) {
                toast.error("Fix invalid amounts before filling right.");
                return;
              }
              const filled = fillRight(
                vals.map((v) => v ?? 0),
                from,
              );
              setRow(
                a.id,
                filled.map((x) => toText(x, currency)),
              );
            }}
          >
            <ArrowRight className="mr-1 size-4" /> Fill right
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canEdit}
            onClick={() => {
              const next = { ...cells };
              delete next[a.id];
              setAnnualDrafts((prev) => {
                const remaining = { ...prev };
                delete remaining[a.id];
                return remaining;
              });
              update(next);
            }}
          >
            Remove
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  const totalRow = (label: string, values: number[], tone?: boolean) => (
    <TableRow className="border-t-2 font-semibold">
      <TableCell className="sticky left-0 z-10 bg-background">{label}</TableCell>
      {values.map((v, i) => (
        <TableCell
          key={i}
          className={`text-right tabular-nums ${tone && v < 0 ? "text-destructive" : ""}`}
        >
          {totalsError ? "—" : fmt.amount(v, currency)}
        </TableCell>
      ))}
      <TableCell className="text-right tabular-nums">
        {totalsError ? "—" : fmt.amount(sum(values), currency)}
      </TableCell>
      <TableCell />
    </TableRow>
  );

  const section = (title: string, list: typeof rows) => (
    <>
      <TableRow className="bg-muted/40">
        <TableCell
          colSpan={data.months.length + 3}
          className="sticky left-0 text-xs font-semibold uppercase tracking-wide"
        >
          {title}
        </TableCell>
      </TableRow>
      {list.length === 0 ? (
        <TableRow>
          <TableCell colSpan={data.months.length + 3} className="text-sm text-muted-foreground">
            No {title.toLowerCase()} accounts in this budget yet.
          </TableCell>
        </TableRow>
      ) : (
        list.map(renderRow)
      )}
    </>
  );

  return (
    <RecordWorkspace
      title={data.budget.name}
      description={`Budget for the financial year from ${fmt.date(data.budget.fiscal_year_start)}, in ${currency}. Amounts are for the account's natural direction: income and expenses as positive numbers.`}
      insights={
        <WorkspaceInsights
          title="Related"
          facts={[
            { label: "Currency", value: currency },
            {
              label: "Fiscal year start",
              value: fmt.date(data.budget.fiscal_year_start),
            },
            { label: "Accounts with lines", value: String(data.lines.length) },
            {
              label: "Lock",
              value: locked ? "Locked" : canManage ? "Editable when unlocked" : "View only",
            },
          ]}
          links={[
            {
              label: "All budgets",
              to: "/budgets",
              hint: "Return to the budget list",
            },
            {
              label: "Budget versus Actual",
              to: "/reports/$reportId",
              params: { reportId: "budget-vs-actual" },
              search: { budget: data.budget.id },
              hint: "Compare budgeted amounts to posted actuals",
            },
          ]}
          footer="Budget amounts are planning figures. Actuals come from the ledger report."
        />
      }
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/budgets">All budgets</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              to="/reports/$reportId"
              params={{ reportId: "budget-vs-actual" }}
              search={{ budget: data.budget.id }}
            >
              Budget versus Actual
            </Link>
          </Button>
        </>
      }
    >
      <BudgetApprovalPanel
        companyId={companyId}
        budgetId={data.budget.id}
        canManage={canManage}
        dirty={dirty}
        hasAmounts={data.lines.length > 0}
        manuallyLocked={locked}
        approval={approvalQuery.data}
        loading={approvalQuery.isPending}
        error={approvalQuery.error}
        onRefresh={() => void approvalQuery.refetch()}
      />

      <BudgetGovernancePanel
        companyId={companyId}
        budgetId={data.budget.id}
        currency={currency}
        canManage={canManage}
        dirty={dirty}
        approvalFrozen={approvalFrozen}
        governance={governanceQuery.data}
        loading={governanceQuery.isPending}
        error={governanceQuery.error}
        onRefresh={() => void governanceQuery.refetch()}
      />

      {!canManage ? (
        <Alert className="mb-4">
          <AlertDescription>
            You can view this budget but not change it. Budgets are managed by owners,
            administrators and accountants.
          </AlertDescription>
        </Alert>
      ) : null}
      {approvalFrozen ? (
        <Alert className="mb-4">
          <AlertDescription>
            This budget is{" "}
            {approvalQuery.data?.status === "pending" ? "awaiting approval" : "approved"} and is
            read-only. Withdraw, reject or reopen the review before changing budget details or
            monthly amounts.
          </AlertDescription>
        </Alert>
      ) : null}
      {locked ? (
        <Alert className="mb-4">
          <AlertDescription>
            This budget is locked. You can review its accounts, revision history and export a copy,
            but changes are blocked until an authorised user unlocks it.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Annual budgeted income</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {totalsError ? "—" : fmt.amount(sum(incomeTotals), currency)}
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Annual budgeted expenses</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {totalsError ? "—" : fmt.amount(sum(expenseTotals), currency)}
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Annual budgeted net profit</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${budgetNetMinor < 0 ? "text-destructive" : ""}`}
          >
            {totalsError ? "—" : fmt.amount(budgetNetMinor, currency)}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="budget-title">Name</Label>
          <Input
            id="budget-title"
            className="w-56"
            value={name}
            maxLength={120}
            disabled={!canEdit}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="budget-notes">Notes</Label>
          <Textarea
            id="budget-notes"
            className="min-h-10 w-64"
            rows={1}
            maxLength={2000}
            placeholder="Optional planning assumptions"
            value={notes}
            disabled={!canEdit}
            onChange={(event) => {
              setNotes(event.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="budget-add">Add account</Label>
          <div className="flex gap-2">
            <AccountLookup
              id="budget-add"
              className="w-64"
              ariaLabel="Add account"
              accounts={available.map((a) => ({
                id: a.id,
                code: a.code,
                name: a.name,
                account_type: a.kind,
                is_active: true,
                is_postable: true,
              }))}
              value={addId}
              onChange={setAddId}
              companyId={companyId}
              purpose="posting"
              placeholder="Choose an income or expense account"
              allowClear
              disabled={!canEdit}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!addId || !canEdit}
              onClick={() => {
                update({ ...cells, [addId]: Array.from({ length: 12 }, () => "") });
                setAddId("");
              }}
            >
              <Plus className="mr-1 size-4" /> Add
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="budget-uplift">Uplift %</Label>
          <div className="flex gap-2">
            <Input
              id="budget-uplift"
              className="w-24"
              inputMode="decimal"
              placeholder="5"
              value={uplift}
              disabled={!canEdit}
              onChange={(e) => setUplift(e.target.value)}
            />
            <Button size="sm" variant="outline" disabled={!canEdit} onClick={onUplift}>
              Apply to all
            </Button>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit}
          onClick={() => void onCopyActuals()}
        >
          Copy last year's actuals
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={hasInvalidAmounts || hiddenLineCount > 0}
            onClick={onExport}
          >
            <Download className="mr-1 size-4" /> Export CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-1 size-4" /> Import CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onImport(f);
            }}
          />
          <Button
            size="sm"
            disabled={
              !canEdit ||
              !dirty ||
              save.isPending ||
              hasInvalidAmounts ||
              unappliedAnnualCount > 0 ||
              hiddenLineCount > 0
            }
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Save className="mr-1 size-4" />
            )}
            Save budget
          </Button>
          {dirty ? (
            <Button size="sm" variant="ghost" disabled={save.isPending} onClick={resetDraft}>
              <RotateCcw className="mr-1 size-4" /> Discard changes
            </Button>
          ) : null}
        </div>
      </div>

      {hiddenLineCount > 0 ? (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>
            This budget contains {hiddenLineCount} saved monthly amount
            {hiddenLineCount === 1 ? "" : "s"} on inactive or unavailable accounts. Those amounts
            are preserved; saving replacements is blocked until the historical accounts can be
            reviewed. Use the revision history to review the original amounts.
          </AlertDescription>
        </Alert>
      ) : null}
      {unappliedAnnualCount > 0 ? (
        <Alert className="mb-3">
          <AlertDescription>
            {unappliedAnnualCount} annual amount
            {unappliedAnnualCount === 1 ? " is" : "s are"} awaiting application. Press Enter or
            leave each annual-total field before saving; the amount will then distribute across all
            twelve months.
          </AlertDescription>
        </Alert>
      ) : null}
      {saveConflict ? (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>
            Another save changed this budget. Your unsaved draft remains on screen.
            <Button
              className="ml-2"
              size="sm"
              variant="outline"
              onClick={() => {
                if (
                  window.confirm("Reload the current budget? Your unsaved draft will be discarded.")
                ) {
                  window.location.reload();
                }
              }}
            >
              Reload latest version
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {totalsError ? (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>
            Budget totals cannot be calculated exactly: {totalsError} Reduce the amounts before
            saving, exporting or applying bulk changes.
          </AlertDescription>
        </Alert>
      ) : null}
      {invalidAmountCount > 0 ? (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>
            {invalidAmountCount} amount
            {invalidAmountCount === 1 ? " is" : "s are"} not a valid number. Fix the highlighted
            monthly or annual amounts before saving, exporting or using bulk actions.
          </AlertDescription>
        </Alert>
      ) : null}
      {issues.length > 0 ? (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>
            <p className="font-medium">Import problems</p>
            <ul className="list-disc pl-5">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {dirty ? (
        <p className="mb-2 text-xs text-muted-foreground">You have unsaved changes.</p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <Label htmlFor="budget-account-search">Find budget account</Label>
          <Input
            id="budget-account-search"
            className="w-64 max-w-full"
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
            placeholder="Account code or name"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {rows.filter(visible).length} of {rows.length} accounts. Totals always include all
          accounts.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background">Account</TableHead>
              {data.months.map((m) => (
                <TableHead key={m} className="text-right">
                  {monthLabel(m)}
                </TableHead>
              ))}
              <TableHead className="text-right">Year</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {section("Income", income.filter(visible))}
            {totalRow("Total income", incomeTotals)}
            {section("Expenses", expense.filter(visible))}
            {totalRow("Total expenses", expenseTotals)}
            {totalRow("Budgeted net profit", netTotals, true)}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Tip: type in a month, then press “Fill right” to repeat it in later months. Editing the Year
        total spreads it evenly (any rounding remainder is distributed to the final months).
        Importing a CSV replaces the rows it contains; accounts not in the file keep their amounts.
      </p>
      <BudgetDimensionsPanel
        companyId={companyId}
        budgetId={data.budget.id}
        canEdit={canEdit}
        parentDirty={dirty}
      />
      <BudgetForecastPanel
        companyId={companyId}
        budgetId={data.budget.id}
        canManage={canManage}
        parentDirty={dirty}
      />
    </RecordWorkspace>
  );
}
