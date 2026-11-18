"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { listCustomers } from "@/lib/sales/sales.functions";
import { listSuppliers } from "@/lib/purchases/purchases.functions";
import {
  listUndepositedReceipts,
  saveMoneyDocument,
} from "@/lib/create-new/money-documents.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  DocumentRecordPanel,
  type DocumentRecordHandle,
} from "@/components/documents/DocumentRecordPanel";
import { moneyRecordMeta } from "@/lib/documents/record-activity";
import { AccountLookup, ContactLookup } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
import type { FormControlWidth } from "@/lib/ui/form-density";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { fromMinorUnits, toMinorUnits } from "@/lib/accounting/money";
import type { BankAdjustmentType } from "@/lib/create-new/journal-contracts";

type Kind =
  | "sales_receipt"
  | "customer_refund"
  | "supplier_refund"
  | "receive_money"
  | "bank_deposit"
  | "card_payment"
  | "bank_adjustment";

const TITLES: Record<Kind, string> = {
  sales_receipt: "Sales receipt",
  customer_refund: "Customer refund",
  supplier_refund: "Supplier refund",
  receive_money: "Receive money",
  bank_deposit: "Bank deposit",
  card_payment: "Credit card payment",
  bank_adjustment: "Bank adjustment",
};

export function MoneyDocumentPanel({
  kind,
  initialBankAccountId,
}: {
  kind: Kind;
  /** Prefill bank account from Banking account context or deep link. */
  initialBankAccountId?: string;
}) {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const today = new Date().toISOString().slice(0, 10);
  const qc = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());
  const save = useServerFn(saveMoneyDocument);
  const fetchAccounts = useServerFn(listAccounts);
  const fetchCustomers = useServerFn(listCustomers);
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchUndeposited = useServerFn(listUndepositedReceipts);

  const [date, setDate] = useState(today);
  const [contactId, setContactId] = useState("");
  const [bankAccountId, setBankAccountId] = useState(initialBankAccountId ?? "");
  const [counterAccountId, setCounterAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [settlement, setSettlement] = useState<"bank" | "undeposited">("bank");
  const [adjustmentType, setAdjustmentType] = useState<BankAdjustmentType>("bank_fee");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const recordRef = useRef<DocumentRecordHandle>(null);
  const recordMeta = moneyRecordMeta(kind);

  useEffect(() => {
    setRecordId(null);
  }, [kind]);

  useEffect(() => {
    if (initialBankAccountId) setBankAccountId(initialBankAccountId);
  }, [initialBankAccountId]);

  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });
  const contactsQ = useQuery({
    queryKey: ["money-contacts", companyId, kind],
    enabled:
      Boolean(companyId) &&
      kind !== "bank_deposit" &&
      kind !== "card_payment" &&
      kind !== "bank_adjustment",
    queryFn: () =>
      kind === "supplier_refund"
        ? fetchSuppliers({ data: { companyId: companyId! } })
        : fetchCustomers({ data: { companyId: companyId! } }),
  });
  const undepositedQ = useQuery({
    queryKey: ["undeposited", companyId],
    enabled: Boolean(companyId) && kind === "bank_deposit",
    queryFn: () => fetchUndeposited({ data: { companyId: companyId! } }),
  });

  const accounts = (accountsQ.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    account_type: string;
    is_postable: boolean;
    is_active: boolean;
  }>;
  const postable = accounts.filter((account) => account.is_active && account.is_postable);
  const banks = postable.filter((account) => account.account_type === "asset");
  const liabilities = postable.filter((account) => account.account_type === "liability");
  const contacts = (contactsQ.data ?? []) as Array<{ id: string; name: string }>;

  const needsContact =
    kind === "sales_receipt" ||
    kind === "customer_refund" ||
    kind === "supplier_refund" ||
    kind === "receive_money";
  const needsIncome = kind === "sales_receipt" || kind === "receive_money";

  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId: companyId!,
          kind,
          documentDate: date,
          idempotencyKey: idempotencyKey.current,
          currencyCode: currency,
          ...(contactId ? { contactId } : {}),
          ...(bankAccountId ? { bankAccountId } : {}),
          ...(counterAccountId ? { counterAccountId } : {}),
          settlement,
          amount,
          taxAmount,
          description,
          reference,
          memo,
          ...(kind === "bank_adjustment" ? { adjustmentType } : {}),
          ...(kind === "bank_deposit" ? { sourceIds } : {}),
        },
      }),
    onSuccess: async (result) => {
      setError(null);
      try {
        await recordRef.current?.flush(result.id);
      } catch (e) {
        toast.error(`Posted, but notes or files could not be stored: ${friendlyAuthError(e)}`);
      }
      setRecordId(result.id);
      toast.success(result.replayed ? "This document was already saved" : `${TITLES[kind]} posted`);
      // Start the next document with a fresh key so it is never mistaken for a replay.
      idempotencyKey.current = crypto.randomUUID();
      setAmount("");
      setTaxAmount("0");
      setDescription("");
      setReference("");
      setMemo("");
      setSourceIds([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["money-documents", companyId] }),
        qc.invalidateQueries({ queryKey: ["undeposited", companyId] }),
        qc.invalidateQueries({ queryKey: ["banking-counts", companyId] }),
        qc.invalidateQueries({ queryKey: ["bank-transactions"] }),
      ]);
    },
    onError: (e) => setError(friendlyAuthError(e)),
  });

  const help = useMemo(() => {
    if (kind === "sales_receipt")
      return "Posts cash and income. It does not create an unpaid receivable.";
    if (kind === "receive_money")
      return "A direct receipt. It is not an invoice payment or a sales receipt.";
    if (kind === "bank_deposit")
      return "Moves undeposited receipts into the selected bank. A receipt can be deposited once.";
    if (kind === "card_payment")
      return "Pays a credit-card liability from a bank account. It is not an expense.";
    if (kind === "customer_refund" || kind === "supplier_refund")
      return "Limited to the contact's remaining credit or overpayment.";
    return "Posts through the ledger. A locked period will reject the date.";
  }, [kind]);

  if (!companyId) return null;

  const moneyTotals = (() => {
    try {
      const amountMinor = amount.trim() ? toMinorUnits(amount, currency) : 0n;
      const taxMinor = taxAmount.trim() ? toMinorUnits(taxAmount, currency) : 0n;
      const totalMinor = amountMinor + (needsIncome ? taxMinor : 0n);
      return {
        amount: fromMinorUnits(amountMinor, currency),
        tax: fromMinorUnits(taxMinor, currency),
        total: fromMinorUnits(totalMinor, currency),
      };
    } catch {
      return null;
    }
  })();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        saveM.mutate();
      }}
    >
      <TransactionWorkspace
        title={TITLES[kind]}
        description={help}
        breadcrumbs={
          kind === "receive_money"
            ? [
                { label: "Banking", to: "/banking" },
                { label: "Receive money" },
              ]
            : [
                { label: "Banking", to: "/banking" },
                { label: "Bank documents", to: "/banking/money-documents" },
                { label: TITLES[kind] },
              ]
        }
        meta={<StatusBadge status={recordId ? "posted" : "draft"} />}
        stickyActions={
          <div className="flex flex-wrap gap-2">
            {kind === "receive_money" ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/banking">Cancel</Link>
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={saveM.isPending}>
              {saveM.isPending ? "Posting…" : "Save & post"}
            </Button>
          </div>
        }
        totals={
          moneyTotals && kind !== "bank_deposit" ? (
            <TotalsSummary
              lines={[
                { id: "amount", label: "Amount", value: moneyTotals.amount },
                ...(needsIncome
                  ? [{ id: "tax", label: "Tax", value: moneyTotals.tax, emphasis: "muted" as const }]
                  : []),
                { id: "total", label: "Total", value: moneyTotals.total, emphasis: "total" as const },
              ]}
            />
          ) : null
        }
        details={
          <div className="space-y-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <FormGrid columns={4}>
        <Field label="Date" width="date">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reference">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {needsContact ? (
          <Field
            width="contact"
            label={
              kind === "supplier_refund"
                ? "Supplier"
                : kind === "receive_money"
                  ? "Payer"
                  : "Customer"
            }
          >
            <ContactLookup
              ariaLabel={
                kind === "supplier_refund"
                  ? "Supplier"
                  : kind === "receive_money"
                    ? "Payer"
                    : "Customer"
              }
              contacts={contacts}
              value={contactId}
              onChange={setContactId}
              companyId={companyId}
              createKind={kind === "supplier_refund" ? "supplier" : "customer"}
              placeholder="Select"
              allowClear={false}
              loading={contactsQ.isPending}
              error={contactsQ.isError ? friendlyAuthError(contactsQ.error) : null}
              onRetry={() => void contactsQ.refetch()}
            />
          </Field>
        ) : null}
        {kind !== "bank_deposit" ? (
          <Field label="Amount" width="money">
            <Input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        ) : null}
        {needsIncome ? (
          <Field label="Tax" width="money">
            <Input
              inputMode="decimal"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
            />
          </Field>
        ) : null}
        <Field
          width="contact"
          label={kind === "card_payment" ? "Pay from bank" : "Bank or clearing account"}
        >
          <AccountLookup
            ariaLabel={kind === "card_payment" ? "Pay from bank" : "Bank or clearing account"}
            accounts={banks}
            value={bankAccountId}
            onChange={setBankAccountId}
            companyId={companyId}
            purpose="posting"
            createKind="bank"
            placeholder="Select"
            allowClear={false}
            loading={accountsQ.isPending}
            error={accountsQ.isError ? friendlyAuthError(accountsQ.error) : null}
            onRetry={() => void accountsQ.refetch()}
          />
        </Field>
        {needsIncome ? (
          <Field label="Income account" width="contact">
            <AccountLookup
              ariaLabel="Income account"
              accounts={postable}
              value={counterAccountId}
              onChange={setCounterAccountId}
              companyId={companyId}
              purpose="posting"
              createKind="revenue"
              placeholder="Select"
              allowClear={false}
              loading={accountsQ.isPending}
              error={accountsQ.isError ? friendlyAuthError(accountsQ.error) : null}
              onRetry={() => void accountsQ.refetch()}
            />
          </Field>
        ) : null}
        {kind === "card_payment" ? (
          <Field label="Credit card liability" width="contact">
            <AccountLookup
              ariaLabel="Credit card liability"
              accounts={liabilities}
              value={counterAccountId}
              onChange={setCounterAccountId}
              companyId={companyId}
              purpose="posting"
              createKind="credit_card"
              placeholder="Select"
              allowClear={false}
              loading={accountsQ.isPending}
              error={accountsQ.isError ? friendlyAuthError(accountsQ.error) : null}
              onRetry={() => void accountsQ.refetch()}
            />
          </Field>
        ) : null}
        {kind === "bank_adjustment" ? (
          <>
            <Field label="Adjustment">
              <Select
                value={adjustmentType}
                onChange={(value) => setAdjustmentType(value as BankAdjustmentType)}
                options={[
                  { value: "bank_fee", label: "Bank fee" },
                  { value: "interest_income", label: "Interest income" },
                  { value: "interest_expense", label: "Interest expense" },
                ]}
              />
            </Field>
            <Field label="Offset account" width="contact">
              <AccountLookup
                ariaLabel="Offset account"
                accounts={postable}
                value={counterAccountId}
                onChange={setCounterAccountId}
                companyId={companyId}
                purpose="posting"
                placeholder="Select"
                allowClear={false}
                loading={accountsQ.isPending}
                error={accountsQ.isError ? friendlyAuthError(accountsQ.error) : null}
                onRetry={() => void accountsQ.refetch()}
              />
            </Field>
          </>
        ) : null}
        {needsIncome ? (
          <Field label="Description">
            <Input required value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        ) : null}
            </FormGrid>
            {needsIncome ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settlement === "undeposited"}
                  onChange={(e) => setSettlement(e.target.checked ? "undeposited" : "bank")}
                />
                Hold in the clearing account for a later bank deposit
              </label>
            ) : null}
            {kind === "bank_deposit" ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Undeposited receipts</legend>
                {(
                  (undepositedQ.data ?? []) as Array<{
                    id: string;
                    document_date: string;
                    total_minor: number;
                    reference: string | null;
                    kind: string;
                  }>
                ).map((row) => (
                  <label key={row.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sourceIds.includes(row.id)}
                      onChange={(e) =>
                        setSourceIds((current) =>
                          e.target.checked
                            ? [...current, row.id]
                            : current.filter((id) => id !== row.id),
                        )
                      }
                    />
                    {row.document_date} · {row.kind} · {(row.total_minor / 100).toFixed(2)}{" "}
                    {row.reference ?? ""}
                  </label>
                ))}
                {(undepositedQ.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No undeposited receipts for this organisation.
                  </p>
                ) : null}
              </fieldset>
            ) : null}
            <Field label="Memo">
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
            </Field>
          </div>
        }
        support={
          recordMeta ? (
            <DocumentRecordPanel
              ref={recordRef}
              entityType={recordMeta.entityType}
              entityId={recordId}
              audience={recordMeta.audience}
            />
          ) : null
        }
      />
    </form>
  );
}

function Field({
  label,
  children,
  width = "default",
}: {
  label: string;
  children: ReactNode;
  width?: FormControlWidth;
}) {
  return (
    <FormControlShell width={width}>
      <Label>{label}</Label>
      {children}
    </FormControlShell>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      className="h-[var(--lb-control-height)] w-full rounded-md border border-input bg-background px-2 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

      <option value="">Select</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
