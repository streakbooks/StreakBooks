import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, GitCompareArrows, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { fiscalYearStart, todayIso } from "@/lib/accounting/fiscal-year";
import { nextBudgetYearStart } from "@/lib/budgets/budget-math";
import { BudgetScenarioComparison } from "@/components/budgets/BudgetScenarioComparison";
import {
  deleteBudget,
  duplicateBudget,
  listBudgets,
  saveBudget,
  type BudgetSummary,
} from "@/lib/budgets/budgets.functions";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_authenticated/budgets/")({
  head: () => ({ meta: [{ title: "Budgets — LinkBooks" }] }),
  component: BudgetsPage,
});

function BudgetsPage() {
  const { company } = useActiveCompany();
  const fmt = useFormat();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useCanDo("accounts.manage");
  const listFn = useServerFn(listBudgets);
  const saveFn = useServerFn(saveBudget);
  const deleteFn = useServerFn(deleteBudget);
  const duplicateFn = useServerFn(duplicateBudget);
  const companyId = company?.id;

  const defaultStart = useMemo(
    () =>
      company
        ? fiscalYearStart(
            todayIso(),
            company.fiscal_year_end_month,
            company.fiscal_year_end_day ?? 28,
          )
        : todayIso(),
    [company],
  );
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showScenarioComparison, setShowScenarioComparison] = useState(false);
  const [copySource, setCopySource] = useState<BudgetSummary | null>(null);
  const [copyName, setCopyName] = useState("");
  const [copyStart, setCopyStart] = useState("");
  const [copyAmounts, setCopyAmounts] = useState(true);
  const [start, setStart] = useState<string | null>(null);
  const fyStart = start ?? defaultStart;

  const query = useQuery({
    queryKey: ["budgets", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listFn({ data: { companyId: companyId! } }),
  });

  const create = useMutation({
    mutationFn: () =>
      saveFn({ data: { companyId: companyId!, name: name.trim(), fiscalYearStart: fyStart } }),
    onSuccess: async ({ id }) => {
      setName("");
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ["budgets", companyId] });
      toast.success("Budget created");
      void navigate({ to: "/budgets/$budgetId", params: { budgetId: id } });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const copy = useMutation({
    mutationFn: () =>
      duplicateFn({
        data: {
          companyId: companyId!,
          sourceBudgetId: copySource!.id,
          name: copyName.trim(),
          fiscalYearStart: copyStart,
          includeAmounts: copyAmounts,
        },
      }),
    onSuccess: async ({ id }) => {
      setCopySource(null);
      await queryClient.invalidateQueries({ queryKey: ["budgets", companyId] });
      toast.success("Budget duplicated");
      void navigate({ to: "/budgets/$budgetId", params: { budgetId: id } });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const openCopy = (budget: BudgetSummary) => {
    setCopySource(budget);
    setCopyName(budget.name);
    setCopyStart(nextBudgetYearStart(budget.fiscal_year_start));
    setCopyAmounts(true);
  };

  const remove = useMutation({
    mutationFn: (budgetId: string) => deleteFn({ data: { companyId: companyId!, budgetId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets", companyId] });
      toast.success("Budget deleted");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const filteredBudgets = (query.data?.budgets ?? []).filter((budget) =>
    `${budget.name} ${budget.fiscal_year_start} ${budget.notes ?? ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <ListWorkspace
      title="Budgets"
      description="Plan income and expenses by account and month for a financial year, then compare with actuals."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!canManage || query.data?.available === false}
            onClick={() => setShowCreate(true)}
          >
            New budget
          </Button>
          <Button
            size="sm"
            variant={showScenarioComparison ? "secondary" : "outline"}
            disabled={!query.data?.available || query.data.budgets.length < 2}
            onClick={() => setShowScenarioComparison((value) => !value)}
            aria-expanded={showScenarioComparison}
          >
            <GitCompareArrows className="mr-2 size-4" />
            Compare budgets
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/imports" search={{ module: "budgets" }}>
              Import budget CSV
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/reports/$reportId" params={{ reportId: "budget-vs-actual" }}>
              Budget versus Actual report
            </Link>
          </Button>
        </div>
      }
    >
      {showCreate ? (
      <section
        aria-label="Create budget"
        className="lb-budget-create mb-6 grid max-w-2xl gap-4 rounded-2xl border border-border/85 bg-card p-5 shadow-card sm:p-6"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-base font-bold tracking-[-0.02em]">New budget</h2>
            <p className="text-xs text-muted-foreground">
              Create a financial-year plan, then add your accounts and monthly amounts.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
            Close
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget-name">Name</Label>
          <Input
            id="budget-name"
            value={name}
            placeholder="e.g. FY budget"
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget-start">Financial year starts</Label>
          <Input
            id="budget-start"
            type="date"
            value={fyStart}
            onChange={(e) => e.target.value && setStart(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The budget covers the twelve months from the month this date falls in. It cannot be
            changed once amounts are entered.
          </p>
        </div>
        <Button
          size="sm"
          disabled={
            create.isPending ||
            name.trim().length < 1 ||
            !canManage ||
            query.isPending ||
            query.data?.available === false
          }
          title={canManage ? undefined : "You do not have permission to manage budgets"}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Create budget
        </Button>
      </section>
      ) : null}

      {query.data?.available ? (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border/65 pb-3">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em]">Existing budgets</h2>
            <p className="text-xs text-muted-foreground">
              {query.data.budgets.length} budget{query.data.budgets.length === 1 ? "" : "s"} in this
              organisation
            </p>
          </div>
          {query.data.budgets.length > 0 ? (
            <div className="space-y-1">
              <Label htmlFor="budgets-search">Search budgets</Label>
              <Input
                id="budgets-search"
                className="w-64 max-w-full"
                placeholder="Name, year or notes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          title="Could not load budgets"
          description={friendlyAuthError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data.available ? (
        <Alert>
          <AlertDescription>
            Budgets are not available yet: the database update that adds them has not been applied.
          </AlertDescription>
        </Alert>
      ) : query.data.budgets.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          description="Create your first budget, then fill in the monthly amounts."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                New budget
              </Button>
            ) : undefined
          }
        />
      ) : filteredBudgets.length === 0 ? (
        <EmptyState
          title="No matching budgets"
          description="Try another name, financial year or note."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/85 bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Financial year from</TableHead>
                <TableHead>Last changed</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBudgets.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link
                      to="/budgets/$budgetId"
                      params={{ budgetId: b.id }}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {b.name}
                    </Link>
                  </TableCell>
                  <TableCell>{fmt.date(b.fiscal_year_start)}</TableCell>
                  <TableCell>{fmt.dateTime(b.updated_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Duplicate ${b.name}`}
                      title="Duplicate budget into another financial year"
                      disabled={!canManage || copy.isPending || remove.isPending}
                      onClick={() => openCopy(b)}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${b.name}`}
                      disabled={!canManage || remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete budget "${b.name}" and all its amounts?`)) {
                          remove.mutate(b.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showScenarioComparison && query.data?.available && query.data.budgets.length >= 2 ? (
        <BudgetScenarioComparison companyId={companyId} budgets={query.data.budgets} />
      ) : null}

      <Dialog
        open={copySource !== null}
        onOpenChange={(open) => {
          if (!open && !copy.isPending) setCopySource(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate budget</DialogTitle>
            <DialogDescription>
              Make a new budget from {copySource?.name}. The source budget will not be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="duplicate-budget-name">New budget name</Label>
              <Input
                id="duplicate-budget-name"
                maxLength={120}
                value={copyName}
                disabled={copy.isPending}
                onChange={(event) => setCopyName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duplicate-budget-start">Target financial year starts</Label>
              <Input
                id="duplicate-budget-start"
                type="date"
                value={copyStart}
                disabled={copy.isPending}
                onChange={(event) => setCopyStart(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Each monthly amount stays in its fiscal-month position, even when the target year
                differs.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="duplicate-budget-amounts"
                checked={copyAmounts}
                disabled={copy.isPending}
                onCheckedChange={(checked) => setCopyAmounts(checked === true)}
              />
              <Label htmlFor="duplicate-budget-amounts">Copy all existing monthly amounts</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              If an original account is no longer active or postable, the full copy is rejected;
              uncheck the option to create an empty budget instead.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={copy.isPending} onClick={() => setCopySource(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                copy.isPending ||
                !canManage ||
                !copyName.trim() ||
                !/^\d{4}-\d{2}-01$/.test(copyStart)
              }
              onClick={() => copy.mutate()}
            >
              {copy.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Duplicate and open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
