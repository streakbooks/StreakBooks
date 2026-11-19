import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listBankAccounts } from "@/lib/banking/banking.functions";
import { canIssueCashAdvance, canReclaimCashAdvance } from "@/lib/expenses/cash-advances";
import {
  cancelExpenseCashAdvance,
  EXPENSE_CASH_ADVANCE_MIGRATION,
  getExpenseManagementSettings,
  issueExpenseCashAdvance,
  listExpenseCashAdvances,
  reclaimExpenseCashAdvance,
  saveExpenseCashAdvance,
} from "@/lib/expenses/expenses.functions";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementCashAdvancesPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const currency = company?.base_currency ?? "USD";
  const today = new Date().toISOString().slice(0, 10);
  const canSubmit = can("expenses.submit" as Permission);
  const canManage =
    can("expenses.manage_advances" as Permission) || can("expenses.admin" as Permission);
  const canView =
    canSubmit ||
    canManage ||
    can("expenses.view" as Permission) ||
    can("expenses.audit" as Permission);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState(today);
  const [bankGlAccountId, setBankGlAccountId] = useState("");

  const fetchAdvances = useServerFn(listExpenseCashAdvances);
  const fetchBanks = useServerFn(listBankAccounts);
  const fetchSettings = useServerFn(getExpenseManagementSettings);
  const saveAdvance = useServerFn(saveExpenseCashAdvance);
  const issueAdvance = useServerFn(issueExpenseCashAdvance);
  const cancelAdvance = useServerFn(cancelExpenseCashAdvance);
  const reclaimAdvance = useServerFn(reclaimExpenseCashAdvance);

  const scope = canManage || can("expenses.view" as Permission) ? "all" : "own";

  const advancesQ = useQuery({
    queryKey: ["expense-cash-advances", company?.id, scope],
    queryFn: () => fetchAdvances({ data: { companyId: company!.id, scope } }),
    enabled: Boolean(company?.id) && canView,
  });

  const banksQ = useQuery({
    queryKey: ["bank-accounts", company?.id, "expense-advances"],
    queryFn: () => fetchBanks({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManage,
  });

  const settingsQ = useQuery({
    queryKey: ["expense-management-settings", company?.id, "advances"],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const bankOptions = useMemo(
    () => (banksQ.data ?? []).filter((account) => account.is_active && account.gl_account_id),
    [banksQ.data],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const amountMinor = Number(parseMinorOrThrow(amount, "Advance amount"));
      return saveAdvance({
        data: {
          companyId: company!.id,
          draft: {
            title: title.trim(),
            advanceDate,
            currencyCode: currency,
            amountMinor,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Draft cash advance saved");
      setTitle("");
      setAmount("");
      await queryClient.invalidateQueries({
        queryKey: ["expense-cash-advances", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const issueMut = useMutation({
    mutationFn: async (input: { id: string; version: number }) => {
      if (!bankGlAccountId) throw new Error("Choose a bank account first.");
      return issueAdvance({
        data: {
          companyId: company!.id,
          advanceId: input.id,
          version: input.version,
          bankAccountId: bankGlAccountId,
          issueDate: today,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Cash advance issued to the ledger");
      await queryClient.invalidateQueries({
        queryKey: ["expense-cash-advances", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const cancelMut = useMutation({
    mutationFn: async (input: { id: string; version: number }) =>
      cancelAdvance({
        data: {
          companyId: company!.id,
          advanceId: input.id,
          version: input.version,
        },
      }),
    onSuccess: async () => {
      toast.success("Draft advance cancelled");
      await queryClient.invalidateQueries({
        queryKey: ["expense-cash-advances", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const reclaimMut = useMutation({
    mutationFn: async (input: { id: string; version: number }) => {
      if (!bankGlAccountId) throw new Error("Choose a bank account first.");
      return reclaimAdvance({
        data: {
          companyId: company!.id,
          advanceId: input.id,
          version: input.version,
          bankAccountId: bankGlAccountId,
          reclaimDate: today,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Unused advance balance reclaimed to bank");
      await queryClient.invalidateQueries({
        queryKey: ["expense-cash-advances", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace
        title="Cash Advances"
        description="Expenses"
        subnav={<ExpenseManagementSubnav current="cash-advances" />}
      >
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.submit or expenses.manage_advances."
        />
      </ListWorkspace>
    );
  }

  const migrationMissing =
    advancesQ.error &&
    String(advancesQ.error.message ?? "").includes(EXPENSE_CASH_ADVANCE_MIGRATION);

  const advanceAccountConfigured = Boolean(settingsQ.data?.employeeAdvanceAccountId);

  return (
    <ListWorkspace
      title="Cash Advances"
      description="Issue employee floats, settle via cash-advance claims, and reclaim unused balances."
      actions={
        <>
          {canSubmit || canManage ? (
            <Button
              size="sm"
              onClick={() =>
                document.getElementById("cash-advance-create")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
            >
              Request advance
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link to="/expense-management/$section" params={{ section: "settings" }}>
              Settings
            </Link>
          </Button>
        </>
      }
      subnav={<ExpenseManagementSubnav current="cash-advances" />}
    >
      {migrationMissing ? (
        <Alert className="mb-6" variant="destructive">
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{EXPENSE_CASH_ADVANCE_MIGRATION}</AlertDescription>
        </Alert>
      ) : null}

      {!advanceAccountConfigured && !settingsQ.isLoading ? (
        <Alert className="mb-6">
          <AlertTitle>Advance account not configured</AlertTitle>
          <AlertDescription>
            Set the employee advance account under Expenses settings before issuing advances.
            Settlement posts credit that asset when cash-advance claims are posted.
          </AlertDescription>
        </Alert>
      ) : null}

      {advancesQ.isError && !migrationMissing ? (
        <QueryErrorState queries={[advancesQ]} title="Could not load cash advances" />
      ) : null}

      {canManage && banksQ.isError && banksQ.data === undefined ? (
        <QueryErrorState queries={[banksQ]} title="Could not load bank accounts" />
      ) : null}

      {(canSubmit || canManage) && (
        <section
          id="cash-advance-create"
          className="mb-10 scroll-mt-24 space-y-4 rounded-lg border p-4"
        >
          <h2 className="text-lg font-medium">Request cash advance</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="adv-title">Title</Label>
              <Input
                id="adv-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Client visit float"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adv-date">Date</Label>
              <Input
                id="adv-date"
                type="date"
                value={advanceDate}
                onChange={(e) => setAdvanceDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adv-amount">Amount ({currency})</Label>
              <Input
                id="adv-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !title.trim() || !amount.trim()}
              >
                {createMut.isPending ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {canManage ? (
        <section className="mb-6 grid max-w-md gap-2">
          <Label>Bank account for issuing / reclaim</Label>
          {banksQ.isError && banksQ.data === undefined ? null : (
            <RecordLookupSelect value={bankGlAccountId} onValueChange={setBankGlAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select bank / cash account" />
              </SelectTrigger>
              <SelectContent>
                {bankOptions.map((bank) => (
                  <SelectItem key={bank.id} value={bank.gl_account_id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
          )}
        </section>
      ) : null}

      {advancesQ.isLoading ? (
        <LoadingState />
      ) : advancesQ.isError ? null : (advancesQ.data ?? []).length === 0 ? (
        <EmptyState
          title="No cash advances yet"
          description="Save a draft request above, then an advance manager issues it from bank."
          action={
            canSubmit || canManage ? (
              <Button
                size="sm"
                onClick={() =>
                  document.getElementById("cash-advance-create")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                Request advance
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Advance</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(advancesQ.data ?? []).map((adv) => {
              const issueGate = canIssueCashAdvance({
                status: adv.status,
                amountMinor: adv.amountMinor,
              });
              const reclaimGate = canReclaimCashAdvance({
                status: adv.status,
                remainingMinor: adv.remainingMinor,
              });
              return (
                <TableRow key={adv.id}>
                  <TableCell>
                    <div className="font-medium">{adv.advanceNumber}</div>
                    <div className="text-sm text-muted-foreground">{adv.title}</div>
                    <div className="text-xs text-muted-foreground">{adv.advanceDate}</div>
                  </TableCell>
                  <TableCell>{fromMinorUnits(adv.amountMinor, adv.currencyCode)}</TableCell>
                  <TableCell>{fromMinorUnits(adv.remainingMinor, adv.currencyCode)}</TableCell>
                  <TableCell>
                    <Badge variant={adv.status === "draft" ? "secondary" : "default"}>
                      {adv.status.replaceAll("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {canManage && issueGate.ok ? (
                      <Button
                        size="sm"
                        disabled={
                          issueMut.isPending || !bankGlAccountId || !advanceAccountConfigured
                        }
                        onClick={() => issueMut.mutate({ id: adv.id, version: adv.version })}
                      >
                        Issue
                      </Button>
                    ) : null}
                    {canManage && reclaimGate.ok ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          reclaimMut.isPending || !bankGlAccountId || !advanceAccountConfigured
                        }
                        onClick={() => reclaimMut.mutate({ id: adv.id, version: adv.version })}
                      >
                        Reclaim
                      </Button>
                    ) : null}
                    {adv.status === "draft" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancelMut.isPending}
                        onClick={() => cancelMut.mutate({ id: adv.id, version: adv.version })}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </ListWorkspace>
  );
}
