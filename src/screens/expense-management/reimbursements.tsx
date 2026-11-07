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
  EXPENSE_REIMBURSEMENT_MIGRATION,
  listExpenseClaims,
  reimburseExpenseClaim,
} from "@/lib/expenses/expenses.functions";
import { canReimburseClaim } from "@/lib/expenses/reimbursement";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementReimbursementsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canPay =
    can("expenses.reimburse" as Permission) || can("expenses.admin" as Permission);
  const [bankGlAccountId, setBankGlAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  const fetchClaims = useServerFn(listExpenseClaims);
  const fetchBanks = useServerFn(listBankAccounts);
  const reimburse = useServerFn(reimburseExpenseClaim);

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
  });

  const banksQ = useQuery({
    queryKey: ["bank-accounts", company?.id, "expense-reimburse"],
    queryFn: () => fetchBanks({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canPay,
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

  const bankOptions = useMemo(
    () =>
      (banksQ.data ?? []).filter((account) => account.is_active && account.gl_account_id),
    [banksQ.data],
  );

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
      void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });
      void queryClient.invalidateQueries({ queryKey: ["expense-management-overview", company?.id] });
      toast.success("Claim reimbursed from bank.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
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
  if (claimsQ.isPending || banksQ.isPending) return <LoadingState />;
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

  return (
    <>
      <PageHeader
        title="Reimbursements"
        description="Pay posted employee-paid claims from a bank account (clears employee payable)."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/purchases/employee-expenses">Legacy employee expenses</Link>
          </Button>
        }
      />
      <ExpenseManagementSubnav current="reimbursements" />

      <Alert className="mb-6">
        <AlertTitle>Full reimbursement only</AlertTitle>
        <AlertDescription>
          EM-07a pays the full reimbursable amount in one journal. Partial and batch payouts come
          later. Claims must already be approved and accrued.
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
