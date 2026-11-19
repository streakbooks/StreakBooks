import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { listPaymentAccounts, saveAndPostExpense } from "@/lib/purchases/purchases.functions";
import { tryParseMinor } from "@/lib/purchases/money-input";
import {
  createSpendMoneyLines,
  emptySpendMoneyLine,
  sumSpendMoneyLinesMinor,
  type SpendMoneyLine,
} from "@/lib/banking/spend-money-lines";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, EmptyState } from "@/components/common/states";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
import { EditableLineItemGrid } from "@/components/common/EditableLineItemGrid";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DocumentRecordPanel,
  type DocumentRecordHandle,
} from "@/components/documents/DocumentRecordPanel";
import { AccountLookup } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { fromMinorUnits } from "@/lib/accounting/money";

export function NewExpense({
  ownership = "purchases",
  initialBankAccountId,
  returnTo,
}: {
  /** Banking owns Spend Money UX; Purchases keep legacy deep links until fully redirected. */
  ownership?: "banking" | "purchases";
  initialBankAccountId?: string;
  /** Safe in-app path to return after post (e.g. /expense-management). */
  returnTo?: string;
} = {}) {
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
  const isBanking = ownership === "banking";

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
  const [paymentAccountId, setPaymentAccountId] = useState(initialBankAccountId ?? "");
  const [lines, setLines] = useState<SpendMoneyLine[]>(() => createSpendMoneyLines());
  const [tax, setTax] = useState("0.00");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const recordRef = useRef<DocumentRecordHandle>(null);
  const addAnotherPending = useRef(false);

  useEffect(() => {
    if (initialBankAccountId) setPaymentAccountId(initialBankAccountId);
  }, [initialBankAccountId]);

  const rolled = useMemo(() => sumSpendMoneyLinesMinor(lines, currency), [lines, currency]);
  const taxMinor = tryParseMinor(tax || "0", currency);
  const taxInvalid = taxMinor === null;
  const netMinor = rolled.netMinor;
  const amountInvalid = netMinor === null;
  const totalMinor =
    netMinor !== null && taxMinor !== null ? Number(netMinor) + Number(taxMinor) : null;

  function updateLine(id: string, patch: Partial<SpendMoneyLine>) {
    setLines((previous) => previous.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function resetForm() {
    setPayeeName("");
    setExpenseDate(today);
    setExpenseAccountId("");
    setPaymentAccountId(initialBankAccountId ?? "");
    setLines(createSpendMoneyLines());
    setTax("0.00");
    setReference("");
    setMemo("");
  }

  const mutation = useMutation({
    mutationFn: (post: boolean) => {
      if (netMinor === null) throw new Error("Enter valid line quantities and prices");
      const composedMemo = [memo.trim(), rolled.memoFromLines]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 500);
      return saveExpense({
        data: {
          companyId: companyId!,
          payeeName,
          expenseDate,
          expenseAccountId,
          paymentAccountId,
          currencyCode: currency,
          netMinor: Number(netMinor),
          taxMinor: Number(taxMinor ?? 0),
          reference,
          memo: composedMemo,
          post,
        },
      });
    },
    onSuccess: async (result) => {
      try {
        await recordRef.current?.flush(result.id);
      } catch (e) {
        toast.error(`Saved, but notes or files could not be stored: ${friendlyAuthError(e)}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["expenses", companyId] });
      toast.success(
        result.journalId
          ? isBanking
            ? "Spend money posted to ledger"
            : "Expense posted to ledger"
          : isBanking
            ? "Spend money draft saved"
            : "Expense draft saved",
      );
      if (addAnotherPending.current) {
        addAnotherPending.current = false;
        resetForm();
        return;
      }
      if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        void navigate({ to: returnTo as never });
        return;
      }
      void navigate({ to: "/purchases/expenses/$expenseId", params: { expenseId: result.id } });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const requiredQueries = [accountsQ, paymentAccountsQ];
  if (requiredQueries.some((query) => query.isError && query.data === undefined))
    return <QueryErrorState queries={requiredQueries} title="Could not load expense accounts" />;

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (accountsQ.isPending || paymentAccountsQ.isPending) return <LoadingState />;

  const blocked =
    mutation.isPending || amountInvalid || taxInvalid || !expenseAccountId || !paymentAccountId;

  return (
    <TransactionWorkspace
      title={isBanking ? "Spend money" : "New direct expense"}
      description={
        isBanking
          ? "Pays immediately from a bank account (DR expense / CR bank). Line amounts roll up to one expense account."
          : "Pays immediately (DR expense / CR bank). Use Bills for supplier invoices paid later."
      }
      breadcrumbs={
        isBanking
          ? [{ label: "Banking", to: "/banking" }, { label: "Spend money" }]
          : [
              { label: "Purchases", to: "/purchases" },
              { label: "Expenses", to: "/purchases/expenses" },
              { label: "New" },
            ]
      }
      meta={<StatusBadge status="draft" />}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
              void navigate({ to: returnTo as never });
              return;
            }
            void navigate({ to: isBanking ? "/banking" : "/purchases/expenses" });
          }}
        >
          {isBanking ? "Back to Banking" : "Back"}
        </Button>
      }
      details={
        <FormGrid columns={4}>
          <FormControlShell width="contact">
            <Label htmlFor="spend-payee">Payee</Label>
            <Input
              id="spend-payee"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="Who was paid"
            />
          </FormControlShell>
          <FormControlShell width="date">
            <Label htmlFor="spend-date">Date</Label>
            <Input
              id="spend-date"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell>
            <Label htmlFor="spend-reference">Reference</Label>
            <Input
              id="spend-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell width="money">
            <Label htmlFor="spend-tax">Tax ({currency})</Label>
            <Input
              id="spend-tax"
              value={tax}
              inputMode="decimal"
              aria-invalid={taxInvalid}
              onChange={(e) => setTax(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell width="contact">
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
          </FormControlShell>
          <FormControlShell width="contact">
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
          </FormControlShell>
          <FormControlShell width="full" className="sm:col-span-2">
            <Label htmlFor="spend-memo">Memo (optional)</Label>
            <Input
              id="spend-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Extra note — line descriptions are appended on save"
            />
          </FormControlShell>
        </FormGrid>
      }
      lines={
        <EditableLineItemGrid
          aria-label="Spend money lines"
          columns={[
            {
              id: "description",
              header: "Description",
              widthPx: 280,
              minWidthPx: 200,
              fluid: true,
            },
            { id: "qty", header: "Qty", align: "right", widthPx: 72, minWidthPx: 64 },
            {
              id: "price",
              header: "Unit price",
              align: "right",
              widthPx: 110,
              minWidthPx: 88,
            },
            {
              id: "amount",
              header: "Amount",
              align: "right",
              widthPx: 110,
              minWidthPx: 88,
              resizable: false,
            },
            { id: "actions", header: "", widthPx: 48, minWidthPx: 40, resizable: false },
          ]}
          onAddRow={() => setLines((previous) => [...previous, emptySpendMoneyLine()])}
          addRowLabel="Add line"
          footer={
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
        >
          {lines.map((line, index) => {
            const qty = Number(line.quantity);
            const unit = tryParseMinor(line.unitPrice || "0", currency);
            const lineMinor =
              Number.isFinite(qty) && unit !== null ? Math.round(qty * Number(unit)) : null;
            return (
              <TableRow key={line.id}>
                <TableCell className="p-0">
                  <Input
                    aria-label={`Line ${index + 1} description`}
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    placeholder="What was purchased"
                  />
                </TableCell>
                <TableCell className="p-0">
                  <Input
                    aria-label={`Line ${index + 1} quantity`}
                    value={line.quantity}
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                  />
                </TableCell>
                <TableCell className="p-0">
                  <Input
                    aria-label={`Line ${index + 1} unit price`}
                    value={line.unitPrice}
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                  />
                </TableCell>
                <TableCell className="px-2 text-right tabular-nums text-sm">
                  {lineMinor === null ? "—" : fromMinorUnits(lineMinor, currency)}
                </TableCell>
                <TableCell className="p-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length <= 1}
                    onClick={() =>
                      setLines((previous) => previous.filter((row) => row.id !== line.id))
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </EditableLineItemGrid>
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
            onClick={() => {
              addAnotherPending.current = false;
              mutation.mutate(false);
            }}
          >
            Save draft
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={blocked || !canPost}
            title={canPost ? undefined : "You do not have permission to post expenses"}
            onClick={() => {
              addAnotherPending.current = true;
              mutation.mutate(true);
            }}
          >
            Save & add another
          </Button>
          <Button
            size="sm"
            disabled={blocked || !canPost}
            title={canPost ? undefined : "You do not have permission to post expenses"}
            onClick={() => {
              addAnotherPending.current = false;
              mutation.mutate(true);
            }}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save & post
          </Button>
        </div>
      }
    />
  );
}
