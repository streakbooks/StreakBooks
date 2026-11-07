import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  batchReimburseExpenseClaims,
  EXPENSE_BATCH_REIMBURSE_MIGRATION,
  EXPENSE_REIMBURSEMENT_MIGRATION,
  listExpenseClaims,
  reimburseExpenseClaim,
} from "@/lib/expenses/expenses.functions";
import {
  canReimburseClaim,
  formatBatchReimburseSummary,
} from "@/lib/expenses/reimbursement";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementReimbursementsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canPay =
    can("expenses.reimburse" as Permission) || can("expenses.admin" as Permission);
  const [bankGlAccountId, setBankGlAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const fetchClaims = useServerFn(listExpenseClaims);
  const fetchBanks = useServerFn(listBankAccounts);
  const reimburse = useServerFn(reimburseExpenseClaim);
  const batchReimburse = useServerFn(batchReimburseExpenseClaims);

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

  const openClaims = useMemo(
    () =>
      (claimsQ.data ?? []).filter((claim) =>
        canReimburseClaim({
          approvalStatus: claim.approvalStatus,
          postingStatus: claim.postingStatus,
          paymentSource: claim.paymentSource,
          reimbursementStatus: claim.reimbursementStatus,
          postedJournalId: claim.postedJournalId,
          reimbursableMinor: claim.reimbursableMinor,
        }).ok,
      ),
    [claimsQ.data],
  );

  const selectedIds = useMemo(
    () => openClaims.filter((claim) => selected[claim.id]).map((claim) => claim.id),
    [openClaims, selected],
  );

  const bankOptions = useMemo(
    () =>
      (banksQ.data ?? []).filter((account) => account.is_active && account.gl_account_id),
    [banksQ.data],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });
    void queryClient.invalidateQueries({ queryKey: ["expense-management-overview", company?.id] });
  };

  const pay = useMutation({
    mutationFn: async (input: { id: string; version: number }) => {
      if (!company) throw new Error("Select a company first.");
      if (!bankGlAccountId) throw new Error("Choose a bank account.");
      return reimburse({
        data: {
          companyId: company.id,
          claimId: input.id,
          version: input.version,
          bankAccountId: bankGlAccountId,
          paymentDate: paymentDate || undefined,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Claim reimbursed from bank.");
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
          paymentDate: paymentDate || undefined,
        },
      });
    },
    onSuccess: (result) => {
      setSelected({});
      invalidate();
      toast.success(formatBatchReimburseSummary(result));
      if (result.failedCount > 0) {
        const firstError = result.results.find((row) => !row.ok)?.error;
        if (firstError) toast.error(firstError);
      }
    },
    onError: (error) => {
      const message = friendlyAuthError(error);
      toast.error(
        message.includes("20261107149000") ? EXPENSE_BATCH_REIMBURSE_MIGRATION : message,
      );
    },
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canPay) {
    return (
      <>
        <PageHeader title="Reimbursements" />
        <ExpenseManagementSubnav current="reimbursements" />
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.reimburse."
        />
      </>
    );
  }
  if (claimsQ.isLoading || banksQ.isLoading) {
    return (
      <>
        <PageHeader title="Reimbursements" description="Expense Management" />
        <ExpenseManagementSubnav current="reimbursements" />
        <LoadingState />
      </>
    );
  }
  if (claimsQ.isError) {
    const message = friendlyAuthError(claimsQ.error);
    return (
      <>
        <PageHeader title="Reimbursements" />
        <ExpenseManagementSubnav current="reimbursements" />
        {message.includes("20261107138000") || message.includes("20261107123000") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_REIMBURSEMENT_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <ErrorState
            title="Could not load reimbursements"
            description={message}
            onRetry={() => claimsQ.refetch()}
          />
        )}
      </>
    );
  }

  const allSelected = openClaims.length > 0 && selectedIds.length === openClaims.length;

  return (
    <>
      <PageHeader
        title="Reimbursements"
        description="Pay posted employee-paid claims from a bank account (clears employee payable)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={batchPay.isPending || selectedIds.length === 0 || !bankGlAccountId}
              onClick={() => batchPay.mutate()}
            >
              {batchPay.isPending
                ? "Paying batch…"
                : `Pay selected (${selectedIds.length})`}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/purchases/employee-expenses">Legacy employee expenses</Link>
            </Button>
          </div>
        }
      />
      <ExpenseManagementSubnav current="reimbursements" />

      <Alert className="mb-6">
        <AlertTitle>Full amount per claim</AlertTitle>
        <AlertDescription>
          Each selected claim is paid in full via its own journal (up to 50 per batch). Partial
          amounts within a claim are not supported yet.
        </AlertDescription>
      </Alert>

      <div className="mb-6 grid max-w-xl gap-3 rounded-lg border p-4">
        <div className="grid gap-2">
          <Label>Bank account</Label>
          <Select value={bankGlAccountId} onValueChange={setBankGlAccountId}>
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
          </Select>
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
            {openClaims.map((claim) => (
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
                    <Link
                      to="/expense-management/claims/$claimId"
                      params={{ claimId: claim.id }}
                    >
                      Open detail
                    </Link>
                  </Button>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{claim.reimbursementStatus}</Badge>
                </TableCell>
                <TableCell>
                  {fromMinorUnits(claim.reimbursableMinor, claim.claimCurrency)}{" "}
                  {claim.claimCurrency}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    disabled={pay.isPending || !bankGlAccountId}
                    onClick={() => pay.mutate({ id: claim.id, version: claim.version })}
                  >
                    Reimburse
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
