import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { listPaymentAccounts, saveAndPostExpense } from "@/lib/purchases/purchases.functions";
import { parseMinorOrThrow, tryParseMinor } from "@/lib/purchases/money-input";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, EmptyState } from "@/components/common/states";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { FormGrid } from "@/components/common/form-layout";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DocumentRecordPanel,
  type DocumentRecordHandle,
} from "@/components/documents/DocumentRecordPanel";
import { AccountLookup } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fromMinorUnits } from "@/lib/accounting/money";

export function NewExpense() {
  const { company } = useActiveCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listAccounts);
  const fetchPaymentAccounts = useServerFn(listPaymentAccounts);
  const saveExpense = useServerFn(saveAndPostExpense);
  const canPost = useCanDo("purchases.authorise");
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const today = new Date().toISOString().slice(0, 10);

  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });

  const accounts = (accountsQ.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    account_type: string;
    is_postable: boolean;
    is_active: boolean;
  }>;
  const expenseAccounts = accounts.filter(
    (a) => a.is_active && a.is_postable && a.account_type === "expense",
  );
  const paymentAccountsQ = useQuery({
    queryKey: ["payment-accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchPaymentAccounts({ data: { companyId: companyId! } }),
  });
  const bankAccounts = (paymentAccountsQ.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
  }>;

  const [payeeName, setPayeeName] = useState("");
  const [expenseDate, setExpenseDate] = useState(today);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [amount, setAmount] = useState("0.00");
  const [tax, setTax] = useState("0.00");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const recordRef = useRef<DocumentRecordHandle>(null);
  const amountInvalid = tryParseMinor(amount || "0", currency) === null;
  const taxInvalid = tryParseMinor(tax || "0", currency) === null;

  const netMinor = tryParseMinor(amount || "0", currency);
  const taxMinor = tryParseMinor(tax || "0", currency);
  const totalMinor =
    netMinor !== null && taxMinor !== null ? Number(netMinor) + Number(taxMinor) : null;

  const mutation = useMutation({
    mutationFn: (post: boolean) =>
      saveExpense({
        data: {
          companyId: companyId!,
          payeeName,
          expenseDate,
          expenseAccountId,
          paymentAccountId,
          currencyCode: currency,
          netMinor: Number(parseMinorOrThrow(amount || "0", currency, "Net amount")),
          taxMinor: Number(parseMinorOrThrow(tax || "0", currency, "Tax")),
          reference,
          memo,
          post,
        },
      }),
    onSuccess: async (result) => {
      try {
        await recordRef.current?.flush(result.id);
      } catch (e) {
        toast.error(`Saved, but notes or files could not be stored: ${friendlyAuthError(e)}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["expenses", companyId] });
      toast.success(result.journalId ? "Expense posted to ledger" : "Expense draft saved");
      navigate({ to: "/purchases/expenses/$expenseId", params: { expenseId: result.id } });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const requiredQueries = [accountsQ, paymentAccountsQ];
  if (requiredQueries.some((query) => query.isError && query.data === undefined))
    return <QueryErrorState queries={requiredQueries} title="Could not load expense accounts" />;

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (accountsQ.isPending || paymentAccountsQ.isPending) return <LoadingState />;

  const blocked = mutation.isPending || amountInvalid || taxInvalid;

  return (
    <TransactionWorkspace
      title="New direct expense"
      description="Pays immediately (DR expense / CR bank). Use Bills for supplier invoices paid later."
      breadcrumbs={[
        { label: "Purchases", to: "/purchases" },
        { label: "Expenses", to: "/purchases/expenses" },
        { label: "New" },
      ]}
      meta={<StatusBadge status="draft" />}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/purchases/expenses">Back</Link>
        </Button>
      }
      details={
        <FormGrid columns={3}>
          <div className="space-y-1 sm:col-span-2 xl:col-span-1">
            <Label>Payee</Label>
            <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2 xl:col-span-1">
            <Label>Expense account</Label>
            <AccountLookup
              ariaLabel="Expense account"
              purpose="expense"
              accounts={expenseAccounts}
              value={expenseAccountId}
              onChange={setExpenseAccountId}
              companyId={companyId}
              placeholder="Select account"
              allowClear={false}
            />
          </div>
          <div className="space-y-1 sm:col-span-2 xl:col-span-1">
            <Label>Payment account (bank)</Label>
            <AccountLookup
              ariaLabel="Payment account"
              purpose="bank"
              accounts={bankAccounts}
              value={paymentAccountId}
              onChange={setPaymentAccountId}
              companyId={companyId}
              placeholder="Select bank account"
              allowClear={false}
            />
          </div>
          <div className="space-y-1">
            <Label>Net ({currency})</Label>
            <Input
              value={amount}
              inputMode="decimal"
              aria-invalid={amountInvalid}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Tax ({currency})</Label>
            <Input
              value={tax}
              inputMode="decimal"
              aria-invalid={taxInvalid}
              onChange={(e) => setTax(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2 xl:col-span-3">
            <Label>Memo</Label>
            <Textarea
              value={memo}
              rows={2}
              className="lb-spreadsheet-wrap min-h-16"
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
        </FormGrid>
      }
      totals={
        <TotalsSummary
          lines={[
            {
              id: "net",
              label: "Net",
              value: fromMinorUnits(Number(netMinor ?? 0), currency),
            },
            {
              id: "tax",
              label: "Tax",
              value: fromMinorUnits(Number(taxMinor ?? 0), currency),
              emphasis: "muted",
            },
            {
              id: "total",
              label: "Total",
              value: fromMinorUnits(totalMinor ?? 0, currency),
              emphasis: "total",
            },
          ]}
        />
      }
      support={
        <DocumentRecordPanel
          ref={recordRef}
          entityType="purchase_expense"
          entityId={null}
          audience="supplier"
        />
      }
      stickyActions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={blocked}
            onClick={() => mutation.mutate(false)}
          >
            Save draft
          </Button>
          <Button
            size="sm"
            disabled={blocked || !canPost}
            title={canPost ? undefined : "You do not have permission to post expenses"}
            onClick={() => mutation.mutate(true)}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save & post
          </Button>
        </div>
      }
    />
  );
}
