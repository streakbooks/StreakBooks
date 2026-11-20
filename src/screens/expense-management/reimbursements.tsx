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
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  batchReimburseExpenseClaims,
  cancelExpenseClaimPayrollQueue,
  EXPENSE_BANK_MATCH_MIGRATION,
  EXPENSE_BATCH_REIMBURSE_MIGRATION,
  EXPENSE_REIMBURSEMENT_MIGRATION,
  listExpenseClaims,
  queueExpenseClaimForPayroll,
  reimburseExpenseClaim,
  refundExpenseClaimReimbursement,
  suggestExpenseReimbursementBankMatches,
} from "@/lib/expenses/expenses.functions";
import {
  canReimburseClaim,
  formatBatchReimburseSummary,
  remainingReimbursableMinor,
} from "@/lib/expenses/reimbursement";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementReimbursementsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canPay = can("expenses.reimburse" as Permission) || can("expenses.admin" as Permission);
  const [bankGlAccountId, setBankGlAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [partialAmounts, setPartialAmounts] = useState<Record<string, string>>({});

  const fetchClaims = useServerFn(listExpenseClaims);
  const fetchBanks = useServerFn(listBankAccounts);
  const reimburse = useServerFn(reimburseExpenseClaim);
  const batchReimburse = useServerFn(batchReimburseExpenseClaims);
  const queuePayroll = useServerFn(queueExpenseClaimForPayroll);
  const cancelPayroll = useServerFn(cancelExpenseClaimPayrollQueue);
  const refundPayment = useServerFn(refundExpenseClaimReimbursement);
  const fetchBankSuggestions = useServerFn(suggestExpenseReimbursementBankMatches);

  const claimsQ = useQuery({
    queryKey: ["expense-claims", company?.id, "reimbursements"],
    queryFn: () =>
      fetchClaims({
        data: {
          companyId: company!.id,
          scope: "all",
          approvalStatuses: ["approved"],
        },
      }),
    enabled: Boolean(company?.id) && canPay,
    retry: false,
  });

  const banksQ = useQuery({
    queryKey: ["bank-accounts", company?.id, "expense-reimburse"],
    queryFn: () => fetchBanks({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canPay,
    retry: false,
  });

  const bankSuggestQ = useQuery({
    queryKey: ["expense-reimburse-bank-suggestions", company?.id],
    queryFn: () => fetchBankSuggestions({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canPay,
    retry: false,
  });

  const openClaims = useMemo(
    () =>
      (claimsQ.data ?? []).filter(
        (claim) =>
          canReimburseClaim({
            approvalStatus: claim.approvalStatus,
            postingStatus: claim.postingStatus,
            paymentSource: claim.paymentSource,
            reimbursementStatus: claim.reimbursementStatus,
            postedJournalId: claim.postedJournalId,
            reimbursableMinor: claim.reimbursableMinor,
            reimbursedMinor: claim.reimbursedMinor,
            reimbursementChannel: claim.reimbursementChannel,
          }).ok,
      ),
    [claimsQ.data],
  );

  const payrollQueued = useMemo(
    () =>
      (claimsQ.data ?? []).filter(
        (claim) =>
          claim.reimbursementChannel === "payroll" &&
          claim.reimbursementStatus === "payment_initiated",
      ),
    [claimsQ.data],
  );

  const refundable = useMemo(
    () =>
      (claimsQ.data ?? []).filter((claim) =>
        ["paid", "partially_paid"].includes(claim.reimbursementStatus),
      ),
    [claimsQ.data],
  );

  const selectedIds = useMemo(
    () => openClaims.filter((claim) => selected[claim.id]).map((claim) => claim.id),
    [openClaims, selected],
  );

  const bankOptions = useMemo(
    () => (banksQ.data ?? []).filter((account) => account.is_active && account.gl_account_id),
    [banksQ.data],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });
    void queryClient.invalidateQueries({ queryKey: ["expense-management-overview", company?.id] });
  };

  const pay = useMutation({
    mutationFn: async (input: { id: string; version: number; remainingMinor: number }) => {
      if (!company) throw new Error("Select a company first.");
      if (!bankGlAccountId) throw new Error("Choose a bank account.");
      const rawAmount = partialAmounts[input.id]?.trim();
      const amountMinor = rawAmount
        ? Number(parseMinorOrThrow(rawAmount, "Payment amount"))
        : input.remainingMinor;
      if (amountMinor <= 0 || amountMinor > input.remainingMinor) {
        throw new Error("Payment amount must be between 0.01 and the remaining balance.");
      }
      return reimburse({
        data: {
          companyId: company.id,
          claimId: input.id,
          version: input.version,
          bankAccountId: bankGlAccountId,
          ...(paymentDate ? { paymentDate } : {}),
          amountMinor,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Bank reimbursement recorded.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const payrollMut = useMutation({
    mutationFn: async (input: { id: string; version: number; cancel?: boolean }) => {
      if (!company) throw new Error("Select a company first.");
      if (input.cancel) {
        return cancelPayroll({
          data: { companyId: company.id, claimId: input.id, version: input.version },
        });
      }
      return queuePayroll({
        data: { companyId: company.id, claimId: input.id, version: input.version },
      });
    },
    onSuccess: (_result, variables) => {
      invalidate();
      toast.success(variables.cancel ? "Payroll queue cancelled." : "Claim queued for payroll.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const refundMut = useMutation({
    mutationFn: async (input: { id: string; version: number }) => {
      if (!company) throw new Error("Select a company first.");
      return refundPayment({
        data: {
          companyId: company.id,
          claimId: input.id,
          version: input.version,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Latest bank reimbursement refunded.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const batchPay = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      if (!bankGlAccountId) throw new Error("Choose a bank account.");
      if (selectedIds.length === 0) throw new Error("Select at least one claim.");
      return batchReimburse({
        data: {
          companyId: company.id,
          claimIds: selectedIds,
          bankAccountId: bankGlAccountId,
          ...(paymentDate ? { paymentDate } : {}),
        },
      });
    },
    onSuccess: (result) => {
      setSelected({});
      invalidate();
      toast.success(formatBatchReimburseSummary(result));
      if (result.failedCount > 0) {
        const firstError = result.results.find((row) => !row.ok)?.error;
        if (firstError) toast.error(friendlyAuthError(firstError));
      }
    },
    onError: (error) => {
      const message = friendlyAuthError(error);
      toast.error(message.includes("20261107149000") ? EXPENSE_BATCH_REIMBURSE_MIGRATION : message);
    },
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canPay) {
    return (
      <ListWorkspace
        title="Reimbursements"
        subnav={<ExpenseManagementSubnav current="reimbursements" />}
      >
        <EmptyState title="No access" description="Ask an administrator for expenses.reimburse." />
      </ListWorkspace>
    );
  }
  if (claimsQ.isLoading || banksQ.isLoading) {
    return (
      <ListWorkspace
        title="Reimbursements"
        description="Expenses"
        subnav={<ExpenseManagementSubnav current="reimbursements" />}
      >
        <LoadingState />
      </ListWorkspace>
    );
  }
  if (claimsQ.isError) {
    const message = friendlyAuthError(claimsQ.error);
    return (
      <ListWorkspace
        title="Reimbursements"
        subnav={<ExpenseManagementSubnav current="reimbursements" />}
      >
        {message.includes("20261107138000") || message.includes("20261107123000") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_REIMBURSEMENT_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <QueryErrorState queries={[claimsQ]} title="Could not load reimbursements" />
        )}
      </ListWorkspace>
    );
  }
  if (banksQ.isError && banksQ.data === undefined) {
    return (
      <ListWorkspace
        title="Reimbursements"
        subnav={<ExpenseManagementSubnav current="reimbursements" />}
      >
        <QueryErrorState queries={[banksQ]} title="Could not load bank accounts" />
      </ListWorkspace>
    );
  }

  const allSelected = openClaims.length > 0 && selectedIds.length === openClaims.length;

  return (
    <ListWorkspace
      title="Reimbursements"
      description="Pay posted employee-paid claims from a bank account (clears employee payable)."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={
              batchPay.isPending ||
              selectedIds.length === 0 ||
              !bankGlAccountId ||
              !banksQ.isSuccess
            }
            onClick={() => batchPay.mutate()}
          >
            {batchPay.isPending ? "Paying batch…" : `Pay selected (${selectedIds.length})`}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/purchases/employee-expenses">Legacy employee expenses</Link>
          </Button>
        </div>
      }
      subnav={<ExpenseManagementSubnav current="reimbursements" />}
    >
      <Alert className="mb-6">
        <AlertTitle>Bank, partial, batch, or payroll queue</AlertTitle>
        <AlertDescription>
          Leave the amount blank to pay the remaining balance. Enter a smaller amount for a partial
          bank payment. Batch pays remaining balances (up to 50). Payroll queue marks the claim for
          payroll processing without posting a payslip in this release.
        </AlertDescription>
      </Alert>

      <div className="mb-6 grid max-w-xl gap-3 rounded-lg border p-4">
        <div className="grid gap-2">
          <Label>Bank account</Label>
          {banksQ.isError ? (
            <QueryErrorState queries={[banksQ]} title="Could not load bank accounts" />
          ) : banksQ.isSuccess ? (
            <RecordLookupSelect value={bankGlAccountId} onValueChange={setBankGlAccountId}>
              <SelectTrigger aria-label="Bank account for reimbursement">
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                {bankOptions.map((account) => (
                  <SelectItem key={account.id} value={account.gl_account_id}>
                    {account.name}
                    {account.accounts?.code ? ` (${account.accounts.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
          ) : (
            <p className="text-sm text-muted-foreground">Loading bank accounts…</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="em-reimburse-date">Payment date</Label>
          <Input
            id="em-reimburse-date"
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
          />
        </div>
      </div>

      {openClaims.length === 0 ? (
        <EmptyState
          title="No claims ready to reimburse"
          description="Approved, posted employee-paid claims awaiting payment appear here."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/expense-management/$section" params={{ section: "approvals" }}>
                Open approvals
              </Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all claims"
                  checked={allSelected}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const next: Record<string, boolean> = {};
                      for (const claim of openClaims) next[claim.id] = true;
                      setSelected(next);
                    } else {
                      setSelected({});
                    }
                  }}
                />
              </TableHead>
              <TableHead>Claim</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="text-right">Pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {openClaims.map((claim) => {
              const remaining = remainingReimbursableMinor({
                reimbursableMinor: claim.reimbursableMinor,
                reimbursedMinor: claim.reimbursedMinor,
              });
              return (
                <TableRow key={claim.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${claim.claimNumber || claim.id}`}
                      checked={Boolean(selected[claim.id])}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => ({ ...prev, [claim.id]: Boolean(checked) }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{claim.claimNumber || "Claim"}</div>
                    <div className="text-sm text-muted-foreground">{claim.title}</div>
                    <Button asChild variant="link" className="h-auto px-0" size="sm">
                      <Link to="/expense-management/claims/$claimId" params={{ claimId: claim.id }}>
                        Open detail
                      </Link>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={claim.reimbursementStatus} />
                  </TableCell>
                  <TableCell>
                    <div>
                      Remaining {fromMinorUnits(remaining, claim.claimCurrency)}{" "}
                      {claim.claimCurrency}
                    </div>
                    {claim.reimbursedMinor > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        Paid {fromMinorUnits(claim.reimbursedMinor, claim.claimCurrency)}
                      </div>
                    ) : null}
                    <Input
                      className="mt-2 h-8 max-w-[9rem]"
                      inputMode="decimal"
                      placeholder="Full remaining"
                      aria-label={`Partial amount for ${claim.claimNumber}`}
                      value={partialAmounts[claim.id] ?? ""}
                      onChange={(event) =>
                        setPartialAmounts((prev) => ({
                          ...prev,
                          [claim.id]: event.target.value,
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      disabled={
                        pay.isPending ||
                        !bankGlAccountId ||
                        !banksQ.isSuccess ||
                        banksQ.isError
                      }
                      onClick={() =>
                        pay.mutate({
                          id: claim.id,
                          version: claim.version,
                          remainingMinor: remaining,
                        })
                      }
                    >
                      Pay bank
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        payrollMut.isPending ||
                        claim.reimbursedMinor > 0 ||
                        !claimsQ.isSuccess ||
                        claimsQ.isError
                      }
                      onClick={() => payrollMut.mutate({ id: claim.id, version: claim.version })}
                    >
                      Queue payroll
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <section className="mt-10 space-y-3">
        <h2 className="text-base font-semibold">Suggested bank matches</h2>
        <p className="text-sm text-muted-foreground">
          Uncategorised bank outflows with the same remaining amount near the claim date. Paying
          still posts the reimbursement journal; categorise the bank line separately in Banking if
          needed.
        </p>
        {bankSuggestQ.isPending ? (
          <LoadingState />
        ) : bankSuggestQ.isError ? (
          friendlyAuthError(bankSuggestQ.error).includes("20261107155000") ? (
            <Alert>
              <AlertTitle>Database update required</AlertTitle>
              <AlertDescription>{EXPENSE_BANK_MATCH_MIGRATION}</AlertDescription>
            </Alert>
          ) : (
            <QueryErrorState queries={[bankSuggestQ]} title="Could not load bank suggestions" />
          )
        ) : (bankSuggestQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No amount/date matches right now.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Bank line</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bankSuggestQ.data ?? []).map((row) => {
                const claim = openClaims.find((item) => item.id === row.claimId);
                const bank = bankOptions.find((account) => account.id === row.bankAccountId);
                return (
                  <TableRow key={`${row.claimId}-${row.bankTransactionId}`}>
                    <TableCell>
                      <div className="font-medium">{row.claimNumber}</div>
                      <div className="text-sm text-muted-foreground">{row.claimTitle}</div>
                    </TableCell>
                    <TableCell>
                      <div>{row.txnDate}</div>
                      <div className="text-sm text-muted-foreground">
                        {row.bankDescription || "Bank outflow"} ·{" "}
                        {fromMinorUnits(Math.abs(row.bankAmountMinor), row.claimCurrency)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        disabled={
                          pay.isPending ||
                          !claim ||
                          !bank?.gl_account_id ||
                          !banksQ.isSuccess ||
                          banksQ.isError
                        }
                        onClick={() => {
                          if (!claim || !bank?.gl_account_id) return;
                          setBankGlAccountId(bank.gl_account_id);
                          pay.mutate({
                            id: claim.id,
                            version: claim.version,
                            remainingMinor: row.remainingMinor,
                          });
                        }}
                      >
                        Pay matched amount
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {payrollQueued.length > 0 ? (
        <section className="mt-10 space-y-3">
          <h2 className="text-base font-semibold">Payroll queue</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollQueued.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell>
                    {claim.claimNumber} — {claim.title}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={payrollMut.isPending}
                      onClick={() =>
                        payrollMut.mutate({
                          id: claim.id,
                          version: claim.version,
                          cancel: true,
                        })
                      }
                    >
                      Cancel queue
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {refundable.length > 0 ? (
        <section className="mt-10 space-y-3">
          <h2 className="text-base font-semibold">Refund latest bank payment</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead className="text-right">Refund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refundable.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell>
                    {claim.claimNumber} — {claim.title}
                  </TableCell>
                  <TableCell>
                    {fromMinorUnits(claim.reimbursedMinor, claim.claimCurrency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={refundMut.isPending || claim.reimbursedMinor <= 0}
                      onClick={() => refundMut.mutate({ id: claim.id, version: claim.version })}
                    >
                      Refund last payment
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </ListWorkspace>
  );
}
