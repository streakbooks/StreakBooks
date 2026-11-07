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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountLookup } from "@/components/lookup";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  deleteExpenseClaimDraft,
  EXPENSE_CLAIM_MIGRATION,
  listExpenseClaims,
  saveExpenseClaim,
  submitExpenseClaim,
  withdrawExpenseClaim,
} from "@/lib/expenses/expenses.functions";
import type { ExpenseManagementSectionKey } from "@/lib/expenses/sections";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementClaimsPage({
  mode,
}: {
  mode: "my-expenses" | "claims";
}) {
  const sectionKey: ExpenseManagementSectionKey = mode;
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const currency = company?.base_currency ?? "USD";
  const today = new Date().toISOString().slice(0, 10);
  const canSubmit = can("expenses.submit" as Permission);
  const canViewAll =
    can("expenses.view" as Permission) ||
    can("expenses.approve" as Permission) ||
    can("expenses.audit" as Permission) ||
    can("expenses.admin" as Permission);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [lineDescription, setLineDescription] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("0");

  const fetchClaims = useServerFn(listExpenseClaims);
  const fetchAccounts = useServerFn(listAccounts);
  const saveClaim = useServerFn(saveExpenseClaim);
  const submitClaim = useServerFn(submitExpenseClaim);
  const withdrawClaim = useServerFn(withdrawExpenseClaim);
  const deleteClaim = useServerFn(deleteExpenseClaimDraft);

  const allowed =
    mode === "my-expenses"
      ? canSubmit || canViewAll
      : canViewAll;

  const claimsQ = useQuery({
    queryKey: ["expense-claims", company?.id, mode],
    queryFn: () =>
      fetchClaims({
        data: { companyId: company!.id, scope: mode === "claims" ? "all" : "own" },
      }),
    enabled: Boolean(company?.id) && allowed,
  });

  const accountsQ = useQuery({
    queryKey: ["accounts", company?.id, "expense-claims"],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canSubmit && mode === "my-expenses",
  });

  const expenseAccounts = useMemo(
    () =>
      (accountsQ.data ?? []).filter(
        (account) =>
          account.is_active && account.is_postable && account.account_type === "expense",
      ),
    [accountsQ.data],
  );

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });

  const create = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      const netMinor = parseMinorOrThrow(amount, "Amount");
      const taxMinor = parseMinorOrThrow(tax || "0", "Tax");
      return saveClaim({
        data: {
          companyId: company.id,
          draft: {
            title: title.trim() || "Expense claim",
            description: description.trim() || undefined,
            claimDate: today,
            claimCurrency: currency,
            paymentSource: "employee_paid",
            lines: [
              {
                expenseDate: today,
                merchantName: merchant.trim() || undefined,
                description: lineDescription.trim() || title.trim() || "Expense",
                accountId,
                netMinor,
                taxMinor,
                grossMinor: netMinor + taxMinor,
                reimbursableMinor: netMinor + taxMinor,
                nonReimbursableMinor: 0,
              },
            ],
          },
        },
      });
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setMerchant("");
      setLineDescription("");
      setAccountId("");
      setAmount("");
      setTax("0");
      invalidate();
      toast.success("Draft claim saved.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const submit = useMutation({
    mutationFn: (claim: { id: string; version: number }) =>
      submitClaim({
        data: { companyId: company!.id, claimId: claim.id, version: claim.version },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Claim submitted.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const withdraw = useMutation({
    mutationFn: (claim: { id: string; version: number }) =>
      withdrawClaim({
        data: { companyId: company!.id, claimId: claim.id, version: claim.version },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Claim withdrawn.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const remove = useMutation({
    mutationFn: (claim: { id: string; version: number }) =>
      deleteClaim({
        data: { companyId: company!.id, claimId: claim.id, version: claim.version },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Draft deleted.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!allowed) {
    return (
      <>
        <PageHeader title={mode === "my-expenses" ? "My Expenses" : "All Claims"} />
        <ExpenseManagementSubnav current={sectionKey} />
        <EmptyState
          title="No access"
          description={
            mode === "my-expenses"
              ? "Ask an administrator for expenses.submit."
              : "Ask an administrator for expenses.view or expenses.approve."
          }
        />
      </>
    );
  }
  if (claimsQ.isPending) return <LoadingState />;
  if (claimsQ.isError) {
    const message = friendlyAuthError(claimsQ.error);
    return (
      <>
        <PageHeader title={mode === "my-expenses" ? "My Expenses" : "All Claims"} />
        <ExpenseManagementSubnav current={sectionKey} />
        {message.includes("202611071") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_CLAIM_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <ErrorState
            title="Could not load claims"
            description={message}
            onRetry={() => claimsQ.refetch()}
          />
        )}
      </>
    );
  }

  const claims = claimsQ.data ?? [];

  return (
    <>
      <PageHeader
        title={mode === "my-expenses" ? "My Expenses" : "All Claims"}
        description={
          mode === "my-expenses"
            ? "Create drafts, submit claims and withdraw eligible submissions."
            : "Organisation-wide expense claims visible to finance and approvers."
        }
      />
      <ExpenseManagementSubnav current={sectionKey} />

      {mode === "my-expenses" && canSubmit ? (
        <form
          className="mb-8 grid max-w-3xl gap-4 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="text-base font-semibold">New draft claim</h2>
          <div className="grid gap-2">
            <Label htmlFor="em-claim-title">Title</Label>
            <Input
              id="em-claim-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="em-claim-desc">Description</Label>
            <Input
              id="em-claim-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="em-merchant">Merchant</Label>
              <Input
                id="em-merchant"
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="em-line-desc">Line description</Label>
              <Input
                id="em-line-desc"
                value={lineDescription}
                onChange={(event) => setLineDescription(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Expense account</Label>
            <AccountLookup
              ariaLabel="Expense account"
              purpose="expense"
              accounts={expenseAccounts}
              value={accountId}
              onChange={setAccountId}
              companyId={company.id}
              placeholder="Select expense account"
              allowClear={false}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="em-amount">Net amount ({currency})</Label>
              <Input
                id="em-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="em-tax">Tax amount</Label>
              <Input id="em-tax" value={tax} onChange={(event) => setTax(event.target.value)} />
            </div>
          </div>
          <Button type="submit" disabled={create.isPending || !accountId}>
            {create.isPending ? "Saving…" : "Save draft"}
          </Button>
        </form>
      ) : null}

      {claims.length === 0 ? (
        <EmptyState
          title="No claims yet"
          description={
            mode === "my-expenses"
              ? "Save a draft above to start a multi-line expense claim."
              : "No organisation claims are visible yet."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((claim) => (
              <TableRow key={claim.id}>
                <TableCell className="font-medium">{claim.claimNumber}</TableCell>
                <TableCell>{claim.title}</TableCell>
                <TableCell>{claim.claimDate}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{claim.approvalStatus}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fromMinorUnits(claim.totalMinor, claim.claimCurrency)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {mode === "my-expenses" && claim.approvalStatus === "draft" ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={submit.isPending}
                          onClick={() => submit.mutate(claim)}
                        >
                          Submit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(claim)}
                        >
                          Delete
                        </Button>
                      </>
                    ) : null}
                    {mode === "my-expenses" &&
                    (claim.approvalStatus === "submitted" ||
                      claim.approvalStatus === "in_review") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={withdraw.isPending}
                        onClick={() => withdraw.mutate(claim)}
                      >
                        Withdraw
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
