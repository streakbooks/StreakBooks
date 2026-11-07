import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  closeExpensePettyCashFloat,
  EXPENSE_PETTY_CASH_MIGRATION,
  fundExpensePettyCashFloat,
  getExpenseManagementSettings,
  listExpensePettyCashFloats,
  saveExpensePettyCashFloat,
} from "@/lib/expenses/expenses.functions";
import {
  canFundPettyCashFloat,
  replenishAmountMinor,
} from "@/lib/expenses/petty-cash";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementPettyCashPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const currency = company?.base_currency ?? "USD";
  const today = new Date().toISOString().slice(0, 10);
  const canManage =
    can("expenses.manage_advances" as Permission) || can("expenses.admin" as Permission);
  const canView =
    canManage ||
    can("expenses.post" as Permission) ||
    can("expenses.view" as Permission) ||
    can("expenses.submit" as Permission) ||
    can("expenses.audit" as Permission);

  const [name, setName] = useState("Front desk");
  const [targetAmount, setTargetAmount] = useState("200.00");
  const [bankGlAccountId, setBankGlAccountId] = useState("");
  const [fundAmount, setFundAmount] = useState("");

  const fetchFloats = useServerFn(listExpensePettyCashFloats);
  const fetchBanks = useServerFn(listBankAccounts);
  const fetchSettings = useServerFn(getExpenseManagementSettings);
  const saveFloat = useServerFn(saveExpensePettyCashFloat);
  const fundFloat = useServerFn(fundExpensePettyCashFloat);
  const closeFloat = useServerFn(closeExpensePettyCashFloat);

  const floatsQ = useQuery({
    queryKey: ["expense-petty-cash-floats", company?.id],
    queryFn: () => fetchFloats({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const banksQ = useQuery({
    queryKey: ["bank-accounts", company?.id, "expense-petty-cash"],
    queryFn: () => fetchBanks({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManage,
  });

  const settingsQ = useQuery({
    queryKey: ["expense-management-settings", company?.id, "petty-cash"],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const bankOptions = useMemo(
    () => (banksQ.data ?? []).filter((account) => account.is_active && account.gl_account_id),
    [banksQ.data],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const targetMinor = Number(parseMinorOrThrow(targetAmount, "Target amount"));
      return saveFloat({
        data: {
          companyId: company!.id,
          draft: {
            name: name.trim(),
            currencyCode: currency,
            targetMinor,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Petty cash float created");
      await queryClient.invalidateQueries({
        queryKey: ["expense-petty-cash-floats", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const fundMut = useMutation({
    mutationFn: async (input: {
      id: string;
      version: number;
      amountMinor: number;
    }) => {
      if (!bankGlAccountId) throw new Error("Choose a bank account first.");
      return fundFloat({
        data: {
          companyId: company!.id,
          floatId: input.id,
          version: input.version,
          bankAccountId: bankGlAccountId,
          amountMinor: input.amountMinor,
          fundDate: today,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Petty cash funded from bank");
      setFundAmount("");
      await queryClient.invalidateQueries({
        queryKey: ["expense-petty-cash-floats", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const closeMut = useMutation({
    mutationFn: async (input: { id: string; version: number }) =>
      closeFloat({
        data: {
          companyId: company!.id,
          floatId: input.id,
          version: input.version,
        },
      }),
    onSuccess: async () => {
      toast.success("Petty cash float closed");
      await queryClient.invalidateQueries({
        queryKey: ["expense-petty-cash-floats", company?.id],
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
      <ListWorkspace title="Petty Cash" description="Expense Management"
      subnav={<ExpenseManagementSubnav current="petty-cash"/>}
    >
      <EmptyState
          title="No access"
          description="Ask an administrator for expenses.manage_advances or expenses.view."
        />
    </ListWorkspace>
    );
  }

  const migrationMissing =
    floatsQ.error &&
    String(floatsQ.error.message ?? "").includes(EXPENSE_PETTY_CASH_MIGRATION);
  const pettyConfigured = Boolean(settingsQ.data?.pettyCashAccountId);

  return (
      <ListWorkspace title="Petty Cash"
        description="Maintain office floats, fund from bank, and settle spends as company-paid claims."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/expense-management/$section" params={{ section: "settings" }}>Settings</Link>
          </Button>
        }
      subnav={<ExpenseManagementSubnav current="petty-cash"/>}
    >
      {migrationMissing ? (
        <Alert className="mb-6" variant="destructive">
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{EXPENSE_PETTY_CASH_MIGRATION}</AlertDescription>
        </Alert>
      ) : null}

      {!pettyConfigured && !settingsQ.isLoading ? (
        <Alert className="mb-6">
          <AlertTitle>Petty cash account not configured</AlertTitle>
          <AlertDescription>
            Set the petty cash asset account under Expense Management settings before funding
            floats. Company-paid claims credit that account when posted.
          </AlertDescription>
        </Alert>
      ) : null}

      {floatsQ.isError && !migrationMissing ? (
        <ErrorState
          title="Could not load petty cash floats"
          description={friendlyAuthError(floatsQ.error)}
          onRetry={() => void floatsQ.refetch()}
        />
      ) : null}

      {canManage ? (
        <>
          <section className="mb-8 space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-medium">New float</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="pc-name">Name</Label>
                <Input
                  id="pc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pc-target">Target amount ({currency})</Label>
                <Input
                  id="pc-target"
                  inputMode="decimal"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => createMut.mutate()}
                  disabled={createMut.isPending || !name.trim()}
                >
                  {createMut.isPending ? "Saving…" : "Create float"}
                </Button>
              </div>
            </div>
          </section>

          <section className="mb-6 grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Bank account for funding</Label>
              <Select value={bankGlAccountId} onValueChange={setBankGlAccountId}>
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
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pc-fund-amt">Custom fund amount ({currency})</Label>
              <Input
                id="pc-fund-amt"
                inputMode="decimal"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="Leave blank to use Replenish"
              />
            </div>
          </section>
        </>
      ) : null}

      {floatsQ.isLoading ? (
        <LoadingState />
      ) : (floatsQ.data ?? []).length === 0 ? (
        <EmptyState
          title="No petty cash floats"
          description="Create a float, fund it from bank, then record spends as company-paid claims."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Float</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(floatsQ.data ?? []).map((float) => {
              const gap = replenishAmountMinor({
                targetMinor: float.targetMinor,
                balanceMinor: float.balanceMinor,
              });
              const fundGate = canFundPettyCashFloat({
                status: float.status,
                amountMinor: gap > 0 ? gap : 1,
              });
              return (
                <TableRow key={float.id}>
                  <TableCell>
                    <div className="font-medium">{float.floatNumber}</div>
                    <div className="text-sm text-muted-foreground">{float.name}</div>
                  </TableCell>
                  <TableCell>
                    {fromMinorUnits(float.balanceMinor, float.currencyCode)}
                  </TableCell>
                  <TableCell>
                    {fromMinorUnits(float.targetMinor, float.currencyCode)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={float.status === "active" ? "default" : "secondary"}>
                      {float.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {canManage && fundGate.ok ? (
                      <>
                        {gap > 0 ? (
                          <Button
                            size="sm"
                            disabled={
                              fundMut.isPending || !bankGlAccountId || !pettyConfigured
                            }
                            onClick={() =>
                              fundMut.mutate({
                                id: float.id,
                                version: float.version,
                                amountMinor: gap,
                              })
                            }
                          >
                            Replenish
                          </Button>
                        ) : null}
                        {fundAmount.trim() ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              fundMut.isPending || !bankGlAccountId || !pettyConfigured
                            }
                            onClick={() => {
                              const amountMinor = Number(
                                parseMinorOrThrow(fundAmount, "Fund amount"),
                              );
                              fundMut.mutate({
                                id: float.id,
                                version: float.version,
                                amountMinor,
                              });
                            }}
                          >
                            Fund
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {canManage && float.status === "active" && float.balanceMinor === 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={closeMut.isPending}
                        onClick={() =>
                          closeMut.mutate({ id: float.id, version: float.version })
                        }
                      >
                        Close
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
