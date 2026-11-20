import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementLoadingShell } from "@/components/expenses/ExpenseManagementLoadingShell";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { listCompanyMembers } from "@/lib/company.functions";
import {
  canFinalizeExitSettlement,
  summarizeExitOutstanding,
} from "@/lib/expenses/exit-settlement";
import {
  EXPENSE_EXIT_SETTLEMENT_MIGRATION,
  createExpenseExitSettlement,
  finalizeExpenseExitSettlement,
  getExpenseExitOutstanding,
  listExpenseExitSettlements,
} from "@/lib/expenses/expenses.functions";
import { listBankAccounts } from "@/lib/banking/banking.functions";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementExitSettlementPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canManage =
    can("expenses.manage_advances" as Permission) || can("expenses.admin" as Permission);
  const canView =
    canManage || can("expenses.view" as Permission) || can("expenses.audit" as Permission);
  const canListMembers = can("members.view" as Permission) || can("expenses.admin" as Permission);

  const [employeeUserId, setEmployeeUserId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");

  const fetchOutstanding = useServerFn(getExpenseExitOutstanding);
  const fetchSettlements = useServerFn(listExpenseExitSettlements);
  const createSettlement = useServerFn(createExpenseExitSettlement);
  const finalizeSettlement = useServerFn(finalizeExpenseExitSettlement);
  const fetchMembers = useServerFn(listCompanyMembers);
  const fetchBanks = useServerFn(listBankAccounts);

  const settlementsQ = useQuery({
    queryKey: ["expense-exit-settlements", company?.id],
    queryFn: () => fetchSettlements({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const outstandingQ = useQuery({
    queryKey: ["expense-exit-outstanding", company?.id, employeeUserId],
    queryFn: () =>
      fetchOutstanding({
        data: { companyId: company!.id, employeeUserId },
      }),
    enabled: Boolean(company?.id) && canView && Boolean(employeeUserId),
    retry: false,
  });

  const membersQ = useQuery({
    queryKey: ["company-members", company?.id, "exit-settlement"],
    queryFn: () => fetchMembers({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManage && canListMembers,
    retry: false,
  });

  const banksQ = useQuery({
    queryKey: ["bank-accounts", company?.id, "exit-settlement"],
    queryFn: () => fetchBanks({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManage,
    retry: false,
  });

  const banks = useMemo(
    () => (banksQ.data ?? []).filter((account) => account.is_active && account.gl_account_id),
    [banksQ.data],
  );

  const members = useMemo(
    () => (membersQ.data ?? []).filter((member) => member.status === "active"),
    [membersQ.data],
  );

  const summary = outstandingQ.data ? summarizeExitOutstanding(outstandingQ.data) : null;

  const createMut = useMutation({
    mutationFn: async () => {
      if (!employeeUserId) throw new Error("Select an employee.");
      return createSettlement({
        data: { companyId: company!.id, employeeUserId },
      });
    },
    onSuccess: async () => {
      toast.success("Draft exit settlement created");
      await queryClient.invalidateQueries({
        queryKey: ["expense-exit-settlements", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const finalizeMut = useMutation({
    mutationFn: async (input: { id: string; version: number }) => {
      const gate = canFinalizeExitSettlement({
        status: "draft",
        openSubmittedClaims:
          outstandingQ.data?.openClaims.filter((c) =>
            ["submitted", "in_review"].includes(c.approvalStatus),
          ).length ?? 0,
        openCardTransactions: outstandingQ.data?.openCardTransactions.length ?? 0,
        bankAccountId,
      });
      if (!gate.ok) throw new Error(gate.error);
      return finalizeSettlement({
        data: {
          companyId: company!.id,
          settlementId: input.id,
          version: input.version,
          bankAccountId,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Exit settlement finalized — advances reclaimed and drafts voided");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["expense-exit-settlements", company?.id] }),
        queryClient.invalidateQueries({ queryKey: ["expense-exit-outstanding", company?.id] }),
        queryClient.invalidateQueries({ queryKey: ["expense-cash-advances", company?.id] }),
        queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] }),
      ]);
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
        title="Exit Settlement"
        subnav={<ExpenseManagementSubnav current="exit-settlement" />}
      >
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.manage_advances."
        />
      </ListWorkspace>
    );
  }
  if (settlementsQ.isLoading) {
    return <ExpenseManagementLoadingShell title="Exit Settlement" current="exit-settlement" />;
  }
  if (settlementsQ.isError) {
    const message = friendlyAuthError(settlementsQ.error);
    return (
      <ListWorkspace
        title="Exit Settlement"
        description="Expenses"
        subnav={<ExpenseManagementSubnav current="exit-settlement" />}
      >
        {message.includes("20261107145000") ? (
          <Alert>
            <AlertTitle>Database update required</AlertTitle>
            <AlertDescription>{EXPENSE_EXIT_SETTLEMENT_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <QueryErrorState queries={[settlementsQ]} title="Could not load exit settlements" />
        )}
      </ListWorkspace>
    );
  }

  const draftForEmployee = (settlementsQ.data ?? []).find(
    (row) => row.employeeUserId === employeeUserId && row.status === "draft",
  );

  return (
    <ListWorkspace
      title="Exit Settlement"
      description="Clear open advances, drafts and card lines when an employee leaves."
      subnav={<ExpenseManagementSubnav current="exit-settlement" />}
    >
      {canManage && membersQ.isError ? (
        <QueryErrorState queries={[membersQ]} title="Could not load company members" />
      ) : null}
      {canManage && banksQ.isError ? (
        <QueryErrorState queries={[banksQ]} title="Could not load bank accounts" />
      ) : null}

      {canManage ? (
        <section id="em-exit-review" className="mb-8 space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Review employee</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Employee</Label>
              {!canListMembers ? (
                <p className="text-sm text-muted-foreground">
                  Members list unavailable (needs members.view). Ask an admin, or apply migrations
                  and grant access.
                </p>
              ) : membersQ.isPending ? (
                <LoadingState />
              ) : membersQ.isError ? null : membersQ.isSuccess && members.length > 0 ? (
                <RecordLookupSelect value={employeeUserId} onValueChange={setEmployeeUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.full_name || member.email || member.user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              ) : membersQ.isSuccess ? (
                <p className="text-sm text-muted-foreground">No active members available.</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Bank account for advance reclaim</Label>
              {banksQ.isError ? null : banksQ.isSuccess ? (
                <RecordLookupSelect value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((bank) => (
                      <SelectItem key={bank.id} value={bank.gl_account_id!}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              ) : (
                <p className="text-sm text-muted-foreground">Loading bank accounts…</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                !employeeUserId ||
                createMut.isPending ||
                Boolean(draftForEmployee) ||
                !canListMembers ||
                !membersQ.isSuccess ||
                membersQ.isError ||
                !banksQ.isSuccess ||
                banksQ.isError
              }
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Creating…" : "Create draft settlement"}
            </Button>
            {draftForEmployee ? (
              <Button
                variant="secondary"
                disabled={
                  finalizeMut.isPending ||
                  !bankAccountId ||
                  !banksQ.isSuccess ||
                  !membersQ.isSuccess
                }
                onClick={() =>
                  finalizeMut.mutate({
                    id: draftForEmployee.id,
                    version: draftForEmployee.version,
                  })
                }
              >
                {finalizeMut.isPending
                  ? "Finalizing…"
                  : `Finalize ${draftForEmployee.settlementNumber}`}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {employeeUserId ? (
        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-medium">Outstanding</h2>
          {outstandingQ.isLoading ? (
            <LoadingState />
          ) : outstandingQ.isError ? (
            <QueryErrorState queries={[outstandingQ]} title="Could not load outstanding items" />
          ) : outstandingQ.data && summary ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="outline">
                  Advances remaining{" "}
                  {fromMinorUnits(summary.advanceRemainingMinor, company.base_currency ?? "USD")}
                </Badge>
                <Badge variant="outline">{summary.openClaimCount} open claims</Badge>
                <Badge variant="outline">{summary.openCardCount} open card lines</Badge>
                {summary.blocking ? (
                  <Badge variant="destructive">Blocking items remain</Badge>
                ) : (
                  <Badge variant="secondary">Ready to finalize when draft exists</Badge>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingQ.data.openAdvances.map((adv) => (
                    <TableRow key={`adv-${adv.id}`}>
                      <TableCell>Advance</TableCell>
                      <TableCell>{adv.advanceNumber}</TableCell>
                      <TableCell>{adv.status}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fromMinorUnits(adv.remainingMinor, adv.currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {outstandingQ.data.openClaims.map((claim) => (
                    <TableRow key={`claim-${claim.id}`}>
                      <TableCell>Claim</TableCell>
                      <TableCell>{claim.claimNumber}</TableCell>
                      <TableCell>
                        {claim.approvalStatus} / {claim.reimbursementStatus}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fromMinorUnits(claim.totalMinor, claim.claimCurrency)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {outstandingQ.data.openCardTransactions.map((tx) => (
                    <TableRow key={`tx-${tx.id}`}>
                      <TableCell>Card</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell>{tx.status}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fromMinorUnits(tx.amountMinor, tx.currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {summary.openClaimCount + summary.openCardCount === 0 &&
                  summary.advanceRemainingMinor === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No outstanding expense items for this employee.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Settlements</h2>
        {settlementsQ.isPending ? (
          <LoadingState />
        ) : settlementsQ.isError ? (
          <QueryErrorState queries={[settlementsQ]} title="Could not load exit settlements" />
        ) : !settlementsQ.isSuccess ? (
          <LoadingState />
        ) : (settlementsQ.data ?? []).length === 0 ? (
          <EmptyState
            title="No exit settlements"
            description="Create a draft for a leaving employee, clear blockers, then finalize."
            action={
              canManage ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("em-exit-review")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  Review employee
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(settlementsQ.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.settlementNumber}</TableCell>
                  <TableCell className="font-mono text-xs">{row.employeeUserId}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "finalized" ? "default" : "secondary"}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.settlementDate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </ListWorkspace>
  );
}
