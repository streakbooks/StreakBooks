import type { Search } from "@/lib/navigation/workspace-search";

import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useEffect, useRef, useState } from "react";

import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  createTransfer,
  listBankAccounts,
  listBankTransfers,
  voidTransfer,
  type BankTransferListRow,
} from "@/lib/banking/banking.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { ConfirmButton } from "@/components/banking/ConfirmButton";
import { MoneyField } from "@/components/banking/MoneyField";
import { moneyFieldMinor } from "@/lib/banking/money-field";
import {
  DocumentRecordPanel,
  type DocumentRecordHandle,
} from "@/components/documents/DocumentRecordPanel";
import { BankLookup } from "@/components/lookup";
import { LoadingState, EmptyState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
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

const EMPTY_PREFILL: Search = {};

/** Full-page transfer create used by Create menu and Banking → Transfers → New. */
export function NewTransfer({
  initialSearch = EMPTY_PREFILL,
}: { initialSearch?: Search | undefined } = {}) {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const search = initialSearch;
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const qc = useQueryClient();
  const fetchAccounts = useServerFn(listBankAccounts);
  const doTransfer = useServerFn(createTransfer);
  const [fromId, setFromId] = useState(
    search.direction === "out" ? (search.bankAccountId ?? "") : "",
  );
  const [toId, setToId] = useState(search.direction === "in" ? (search.bankAccountId ?? "") : "");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(search.amount ?? "");
  const [memo, setMemo] = useState("");
  const [received, setReceived] = useState("");
  const [recordId, setRecordId] = useState<string | null>(null);
  const recordRef = useRef<DocumentRecordHandle>(null);

  useEffect(() => {
    if (search.direction === "out" && search.bankAccountId) setFromId(search.bankAccountId);
    if (search.direction === "in" && search.bankAccountId) setToId(search.bankAccountId);
    if (search.amount) setAmount(search.amount);
  }, [search.bankAccountId, search.direction, search.amount]);

  const accountsQ = useQuery({
    queryKey: ["bank-accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });

  const accounts = accountsQ.data ?? [];
  const fromAcc = accounts.find((a) => a.id === fromId);
  const toAcc = accounts.find((a) => a.id === toId);
  const currency = fromAcc?.currency_code ?? company?.base_currency ?? "GBP";
  const currencyMismatch = Boolean(
    fromAcc && toAcc && fromAcc.currency_code !== toAcc.currency_code,
  );
  const amountMinor = moneyFieldMinor(amount, currency, { allowNegative: false });
  const toCurrency = toAcc?.currency_code ?? currency;
  const receivedMinor = moneyFieldMinor(received, toCurrency, { allowNegative: false });
  const canPost =
    accountsQ.isSuccess &&
    !accountsQ.isError &&
    Boolean(fromId && toId && fromId !== toId) &&
    amountMinor !== null &&
    amountMinor > 0n &&
    (!currencyMismatch || (receivedMinor !== null && receivedMinor > 0n));

  const mutation = useMutation({
    mutationFn: () =>
      doTransfer({
        data: {
          companyId: companyId!,
          fromBankAccountId: fromId,
          toBankAccountId: toId,
          transferDate: date,
          amountMinor: Number(amountMinor),
          currencyCode: currency,
          toAmountMinor: currencyMismatch && receivedMinor !== null ? Number(receivedMinor) : null,
          memo,
          ...(typeof search.bankTransactionId === "string"
            ? { matchBankTransactionId: search.bankTransactionId }
            : {}),
        },
      }),
    onSuccess: async (result) => {
      try {
        await recordRef.current?.flush(result.id);
      } catch (e) {
        toast.error(
          `Transfer posted, but notes or files could not be stored: ${friendlyAuthError(e)}`,
        );
      }
      setRecordId(result.id);
      if (result.matched) {
        toast.success("Transfer posted and statement line matched.");
      } else if (result.matchError) {
        toast.error(
          `Transfer posted, but the statement line was not matched: ${friendlyAuthError(result.matchError)}`,
        );
      } else {
        toast.success("Transfer posted. One journal only.");
      }
      await qc.invalidateQueries({ queryKey: ["bank-transfers", companyId] });
      await qc.invalidateQueries({ queryKey: ["bank-account-summaries", companyId] });
      await qc.invalidateQueries({ queryKey: ["bank-transactions", companyId] });
      await qc.invalidateQueries({ queryKey: ["bank-match-candidates", companyId] });
      void navigate({ to: "/banking/transfers" });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (accountsQ.isPending) return <LoadingState />;
  if (accountsQ.isError)
    return <QueryErrorState queries={[accountsQ]} title="Could not load bank accounts" />;
  if (!accountsQ.isSuccess || !accountsQ.data) return null;

  return (
    <TransactionWorkspace
      title="Transfer money"
      description={
        typeof search.bankTransactionId === "string"
          ? "Moves money between your bank/cash accounts with a single DR/CR journal. The source statement line will be matched automatically after posting."
          : "Moves money between your bank/cash accounts with a single DR/CR journal, so nothing is counted twice. Match the statement lines on both accounts to it afterwards."
      }
      breadcrumbs={[
        { label: "Banking", to: "/banking" },
        { label: "Transfers", to: "/banking/transfers" },
        { label: "New" },
      ]}
      meta={<StatusBadge status="draft" label="Draft" />}
      stickyActions={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/banking/transfers">Cancel</Link>
          </Button>
          <ConfirmButton
            variant="default"
            size="sm"
            title="Post this bank transfer?"
            description={
              <span>
                Transfer {amount} {currency} from {fromAcc?.name ?? "source account"} to{" "}
                {toAcc?.name ?? "destination account"} on {date}.
                {currencyMismatch ? ` Destination receives ${received} ${toCurrency}.` : ""} This
                creates a ledger journal; corrections require a reversal.
              </span>
            }
            confirmLabel="Post transfer"
            disabled={mutation.isPending || !canPost}
            onConfirm={() => {
              if (canPost && !mutation.isPending) mutation.mutate();
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Post transfer
          </ConfirmButton>
        </div>
      }
      details={
        <FormGrid columns={4}>
          <FormControlShell width="contact" className="sm:col-span-2">
            <Label>From</Label>
            <BankLookup
              ariaLabel="From account"
              accounts={accounts}
              value={fromId}
              onChange={setFromId}
              companyId={companyId}
              excludeId={toId || undefined}
              placeholder="Source"
              allowClear={false}
            />
          </FormControlShell>
          <FormControlShell width="contact" className="sm:col-span-2">
            <Label>To</Label>
            <BankLookup
              ariaLabel="To account"
              accounts={accounts}
              value={toId}
              onChange={setToId}
              companyId={companyId}
              excludeId={fromId || undefined}
              placeholder="Destination"
              allowClear={false}
            />
          </FormControlShell>
          {currencyMismatch ? (
            <FormControlShell className="sm:col-span-4">
              <p className="text-sm text-muted-foreground">
                These accounts are in different currencies. Enter what each side shows on the
                statement. The difference against the stored exchange rates is posted to FX
                gain/loss.
              </p>
            </FormControlShell>
          ) : null}
          <FormControlShell width="date">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormControlShell>
          <FormControlShell width="money">
            <Label>Amount ({currency})</Label>
            <MoneyField
              label="Transfer amount"
              value={amount}
              currency={currency}
              options={{ allowNegative: false }}
              onChange={setAmount}
            />
          </FormControlShell>
          {currencyMismatch ? (
            <FormControlShell width="money">
              <Label>Amount received ({toCurrency})</Label>
              <MoneyField
                label="Amount received"
                value={received}
                currency={toCurrency}
                options={{ allowNegative: false }}
                onChange={setReceived}
              />
            </FormControlShell>
          ) : null}
          <FormControlShell className="sm:col-span-2">
            <Label>Memo</Label>
            <Input value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} />
          </FormControlShell>
        </FormGrid>
      }
      totals={
        <TotalsSummary
          aria-label="Transfer totals"
          lines={[
            {
              id: "amount",
              label: `Amount (${currency})`,
              value:
                amountMinor !== null
                  ? fromMinorUnits(Number(amountMinor), currency)
                  : amount.trim()
                    ? "—"
                    : fromMinorUnits(0, currency),
              emphasis: currencyMismatch ? "default" : "total",
            },
            ...(currencyMismatch
              ? [
                  {
                    id: "received",
                    label: `Received (${toCurrency})`,
                    value:
                      receivedMinor !== null
                        ? fromMinorUnits(Number(receivedMinor), toCurrency)
                        : received.trim()
                          ? "—"
                          : fromMinorUnits(0, toCurrency),
                    emphasis: "total" as const,
                  },
                ]
              : []),
          ]}
        />
      }
      support={
        <DocumentRecordPanel
          ref={recordRef}
          entityType="bank_transfer"
          entityId={recordId}
          audience="internal"
        />
      }
    />
  );
}

export function Transfers({
  initialSearch = EMPTY_PREFILL,
}: { initialSearch?: Search | undefined } = {}) {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const search = initialSearch;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchTransfers = useServerFn(listBankTransfers);
  const doVoid = useServerFn(voidTransfer);

  // Prefill from reconcile "Create transfer" → dedicated create workspace.
  useEffect(() => {
    if (search.bankAccountId || search.amount || search.direction || search.bankTransactionId) {
      void navigate({
        to: "/banking/transfers/new",
        search: {
          ...(typeof search.bankAccountId === "string"
            ? { bankAccountId: search.bankAccountId }
            : {}),
          ...(typeof search.amount === "string" ? { amount: search.amount } : {}),
          ...(search.direction === "in" || search.direction === "out"
            ? { direction: search.direction }
            : {}),
          ...(typeof search.bankTransactionId === "string"
            ? { bankTransactionId: search.bankTransactionId }
            : {}),
        },
        replace: true,
      });
    }
  }, [navigate, search.amount, search.bankAccountId, search.bankTransactionId, search.direction]);

  const transfersQ = useQuery({
    queryKey: ["bank-transfers", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchTransfers({ data: { companyId: companyId! } }),
  });

  const voidM = useMutation({
    mutationFn: (transferId: string) => doVoid({ data: { companyId: companyId!, transferId } }),
    onSuccess: async () => {
      toast.success("Transfer voided via reversal journal");
      await qc.invalidateQueries({ queryKey: ["bank-transfers", companyId] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (transfersQ.isError)
    return <QueryErrorState queries={[transfersQ]} title="Could not load bank transfers" />;

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const currency = company?.base_currency ?? "GBP";

  return (
    <ListWorkspace
      title="Transfers"
      description="History of bank/cash transfers. Create a transfer to move money with a single DR/CR journal."
      actions={
        <Button size="sm" asChild>
          <Link to="/banking/transfers/new">New transfer</Link>
        </Button>
      }
    >
      {transfersQ.isPending ? (
        <LoadingState />
      ) : !transfersQ.isSuccess ? (
        <LoadingState />
      ) : (transfersQ.data ?? []).length === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Post a transfer between your bank or cash accounts."
          action={
            <Button size="sm" asChild>
              <Link to="/banking/transfers/new">New transfer</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(transfersQ.data as BankTransferListRow[]).map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.transfer_date}</TableCell>
                <TableCell>{t.from_name}</TableCell>
                <TableCell>{t.to_name}</TableCell>
                <TableCell className="money">
                  {fromMinorUnits(t.amount_minor, t.currency_code || currency)} {t.currency_code}
                  {t.to_amount_minor != null && t.to_currency_code !== t.currency_code ? (
                    <span className="block text-xs text-muted-foreground">
                      received {fromMinorUnits(t.to_amount_minor, t.to_currency_code ?? currency)}{" "}
                      {t.to_currency_code}
                      {t.fx_difference_minor !== 0
                        ? `, FX ${fromMinorUnits(t.fx_difference_minor, company?.base_currency ?? currency)}`
                        : ""}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{t.memo ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{t.status}</Badge>
                </TableCell>
                <TableCell>
                  {t.status === "posted" ? (
                    <ConfirmButton
                      title="Void this transfer?"
                      description="A reversing journal is posted and the transfer is marked void."
                      confirmLabel="Void"
                      disabled={voidM.isPending}
                      onConfirm={() => voidM.mutate(t.id)}
                    >
                      Void
                    </ConfirmButton>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListWorkspace>
  );
}
