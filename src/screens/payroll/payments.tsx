import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { fromMinorUnits } from "@/lib/accounting/money";
import { todayLocalDateOnly } from "@/lib/payroll/local-date";
import { PAYROLL_SETTLEMENT_REFRESH_KEYS } from "@/lib/payroll/settlement-query-keys";
import { acquirePayrollMutationLock, releasePayrollMutationLock } from "@/lib/payroll/action-lock";
import { buildGenericPayrollBankCsv } from "@/lib/payroll/payroll-bank-export";
import { downloadCsv } from "@/lib/reports/csv";
import { parsePayrollPaymentEntry } from "@/lib/payroll/payment-form-draft";
import { getPayrollSettingsPage } from "@/lib/payroll/payroll.functions";
import {
  exportPayrollBankCsvRows,
  getPayrollPayment,
  listPayrollPayments,
  listPayrollSettlementAccounts,
  recordPayrollPayment,
  reversePayrollPayment,
  type PayrollPaymentDetailPage,
} from "@/lib/payroll/payments.functions";
import { listPayrollPayslips } from "@/lib/payroll/runs.functions";
import type { PayslipSnapshot } from "@/lib/payroll/payslip-snapshot";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AccountLookup } from "@/components/lookup";

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  manual: "Manual confirmation",
  other: "Other",
};

export function PayrollPaymentsPage({ runIdFilter }: { runIdFilter?: string | null }) {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const canPay = useCanDo("payroll.pay");
  const canAccountingView = useCanDo("accounting.view");
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const fetchPayments = useServerFn(listPayrollPayments);
  const fetchExport = useServerFn(exportPayrollBankCsvRows);
  const fetchPayslips = useServerFn(listPayrollPayslips);
  const fetchPayrollSettings = useServerFn(getPayrollSettingsPage);
  const fetchAccounts = useServerFn(listPayrollSettlementAccounts);
  const savePayment = useServerFn(recordPayrollPayment);

  const [recordOpen, setRecordOpen] = useState(false);
  const paymentSubmitLock = useRef(false);
  const reversalSubmitLock = useRef(false);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"all" | "posted" | "reversed">("all");
  const [paymentDate, setPaymentDate] = useState(() => todayLocalDateOnly());
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [clearingAccountId, setClearingAccountId] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() => `pr-pay-${crypto.randomUUID()}`);
  const [reverseTarget, setReverseTarget] = useState<{ id: string; currency: string } | null>(null);
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null);
  const [reversalDate, setReversalDate] = useState(() => todayLocalDateOnly());
  const reversePayment = useServerFn(reversePayrollPayment);
  const fetchPaymentDetail = useServerFn(getPayrollPayment);

  const settingsQ = useQuery({
    queryKey: ["payroll-settings-page", company?.id],
    queryFn: () => fetchPayrollSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canPay && recordOpen,
  });
  const payCurrency = (
    settingsQ.data?.settings?.payroll_currency ??
    company?.base_currency ??
    "GBP"
  ).toUpperCase();
  // The current SQL settlement journal uses FX rate 1. Recording cross-currency
  // payments before supported conversion would misstate the GL.
  const fxUnsupported = Boolean(
    settingsQ.data && company && payCurrency !== company.base_currency.toUpperCase(),
  );
  const settingsReady = Boolean(
    settingsQ.isSuccess && settingsQ.data?.available && settingsQ.data?.settings,
  );

  const paymentsQ = useQuery({
    queryKey: ["payroll-payments", company?.id, runIdFilter ?? null],
    queryFn: () =>
      fetchPayments({
        data: { companyId: company!.id, runId: runIdFilter ?? null },
      }),
    enabled: Boolean(company?.id) && canView,
  });

  const paymentDetailQ = useQuery({
    queryKey: ["payroll-payment-detail", company?.id, detailPaymentId],
    queryFn: () =>
      fetchPaymentDetail({
        data: { companyId: company!.id, paymentId: detailPaymentId! },
      }),
    enabled: Boolean(company?.id) && canView && detailPaymentId !== null,
  });

  const payslipsQ = useQuery({
    queryKey: ["payroll-open-payslips", company?.id, runIdFilter ?? null],
    queryFn: () => fetchPayslips({ data: { companyId: company!.id, runId: runIdFilter ?? null } }),
    enabled: Boolean(company?.id) && canPay && recordOpen,
  });

  const accountsQ = useQuery({
    queryKey: ["payroll-payment-accounts", company?.id],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canPay && recordOpen,
  });

  const availableClearingAccounts = accountsQ.data?.accounts ?? [];
  const excludedClearingAccounts = accountsQ.data?.excluded ?? 0;

  const openPayslips = useMemo(() => {
    const items =
      (
        payslipsQ.data as
          | {
              payslips?: Array<{
                payslip: {
                  id: string;
                  amount_paid_minor: number;
                  payslip_number: string;
                  snapshot: PayslipSnapshot;
                };
                employee: { first_name: string; last_name: string };
                run: { run_number: string; status: string; currency: string };
              }>;
            }
          | undefined
      )?.payslips ?? [];
    return items
      .filter(
        (row) =>
          ["posted", "paid", "complete"].includes(row.run.status) &&
          row.run.currency.toUpperCase() === payCurrency,
      )
      .map((row) => {
        const net = row.payslip.snapshot.totals?.netPayMinor ?? 0;
        const outstanding = Math.max(0, net - row.payslip.amount_paid_minor);
        return { ...row, outstanding, net };
      })
      .filter((row) => row.outstanding > 0);
  }, [payslipsQ.data, payCurrency]);

  const exportMut = useMutation({
    mutationFn: () => fetchExport({ data: { companyId: company!.id, runId: runIdFilter ?? null } }),
    onSuccess: (data) => {
      if (!data.rows.length) {
        toast.message("Nothing to export", {
          description: "No posted runs have outstanding net pay with open payslips.",
        });
        return;
      }
      const csv = buildGenericPayrollBankCsv(data.rows);
      // Shared downloader writes a UTF-8 BOM for international names and
      // safely cleans up the temporary anchor after starting the download.
      downloadCsv("payroll-bank-export-generic.csv", csv);
      toast.success("Generic CSV downloaded", {
        description: data.disclaimer,
      });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const recordMut = useMutation({
    mutationFn: () => {
      if (!settingsReady) {
        throw new Error("Payroll settings must finish loading before recording a payment.");
      }
      if (payslipsQ.isPending || payslipsQ.isError) {
        throw new Error("Outstanding payslips must finish loading before recording a payment.");
      }
      if (fxUnsupported) {
        throw new Error("Foreign-currency payroll settlement requires configured FX accounting.");
      }
      const { amountMinor, allocations } = parsePayrollPaymentEntry({
        amount: amountMajor,
        currency: payCurrency,
        allocations: alloc,
        payslips: openPayslips.map((row) => ({
          payslipId: row.payslip.id,
          currency: row.run.currency,
          netMinor: row.net,
          paidMinor: row.payslip.amount_paid_minor,
        })),
      });

      return savePayment({
        data: {
          companyId: company!.id,
          paymentDate,
          paymentMethod,
          amountMinor,
          currencyCode: payCurrency,
          clearingAccountId,
          reference,
          memo,
          idempotencyKey,
          allocations,
        },
      });
    },
    onSuccess: (result) => {
      if (result.replayed) {
        toast.message("Existing payroll payment confirmed", {
          description: "This was a safe retry. No second payment or journal was created.",
        });
      } else {
        toast.success("Payroll payment recorded");
      }
      setRecordOpen(false);
      setAlloc({});
      setAmountMajor("");
      setIdempotencyKey(`pr-pay-${crypto.randomUUID()}`);
      // Both posting and reversal affect outstanding payslips, details and
      // run summaries; otherwise reopening the settlement form may show
      // stale paid amounts and invite a duplicate allocation.
      for (const queryKey of PAYROLL_SETTLEMENT_REFRESH_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
    onSettled: () => releasePayrollMutationLock(paymentSubmitLock),
  });

  const reverseMut = useMutation({
    mutationFn: () =>
      reversePayment({
        data: {
          companyId: company!.id,
          paymentId: reverseTarget!.id,
          reversalDate,
        },
      }),
    onSuccess: () => {
      toast.success("Payment reversed");
      setReverseTarget(null);
      // Both posting and reversal affect outstanding payslips, details and
      // run summaries; otherwise reopening the settlement form may show
      // stale paid amounts and invite a duplicate allocation.
      for (const queryKey of PAYROLL_SETTLEMENT_REFRESH_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
    onSettled: () => releasePayrollMutationLock(reversalSubmitLock),
  });

  const submitRecordPayment = () => {
    if (recordMut.isPending || !acquirePayrollMutationLock(paymentSubmitLock)) return;
    recordMut.mutate();
  };

  const submitReversePayment = () => {
    if (!reverseTarget || reverseMut.isPending || !acquirePayrollMutationLock(reversalSubmitLock)) {
      return;
    }
    reverseMut.mutate();
  };

  const openRecordDialog = () => {
    if (recordMut.isPending || paymentSubmitLock.current) return;
    // Do not inherit bank, allocation or memo fields from a previous settlement.
    setClearingAccountId("");
    setAlloc({});
    setAmountMajor("");
    setReference("");
    setMemo("");
    setPaymentMethod("bank_transfer");
    setPaymentDate(todayLocalDateOnly());
    setIdempotencyKey(`pr-pay-${crypto.randomUUID()}`);
    setRecordOpen(true);
  };

  // Preserve native Payroll navigation during loading, missing-company and error states.
  const renderPaymentState = (content: ReactNode) => (
    <ListWorkspace title="Payroll payments">
      <PayrollSubnav current="payments" />
      {content}
    </ListWorkspace>
  );

  if (isPending) return renderPaymentState(<LoadingState />);
  if (!company) {
    return renderPaymentState(
      <CompanyEmptyState title="No organisation" description="Select a company first." />,
    );
  }
  if (!canView) {
    return renderPaymentState(
      <EmptyState title="No payroll access" description="Ask for payroll.view permission." />,
    );
  }

  const page = paymentsQ.data;
  if (paymentsQ.isPending) return renderPaymentState(<LoadingState />);
  if (paymentsQ.isError) {
    return renderPaymentState(
      <QueryErrorState queries={[paymentsQ]} title="Could not load payments" />,
    );
  }
  if (page && !page.available) {
    return (
      <ListWorkspace title="Payroll payments">
        <PayrollSubnav current="payments" />
        <EmptyState title="Migration pending" description={page.migrationMessage ?? ""} />
      </ListWorkspace>
    );
  }

  const payments = page?.payments ?? [];
  const filtersActive = paymentStatus !== "all" || paymentSearch.trim() !== "";
  const filteredPayments = payments.filter((payment) => {
    if (paymentStatus !== "all" && payment.status !== paymentStatus) return false;
    const needle = paymentSearch.trim().toLocaleLowerCase();
    return (
      !needle ||
      [
        payment.payment_date,
        payment.reference ?? "",
        METHOD_LABELS[payment.payment_method] ?? payment.payment_method,
      ].some((value) => value.toLocaleLowerCase().includes(needle))
    );
  });
  const clearPaymentFilters = () => {
    setPaymentSearch("");
    setPaymentStatus("all");
  };

  return (
    <ListWorkspace
      title="Payroll payments"
      description="Record net-pay settlements against posted runs. Partial and multiple payments are supported."
      actions={
        <div className="flex flex-wrap gap-2">
          {canPay ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={exportMut.isPending}
                onClick={() => exportMut.mutate()}
              >
                Generic bank CSV
              </Button>
              <Button size="sm" disabled={recordMut.isPending} onClick={openRecordDialog}>
                Record payment
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      <PayrollSubnav current="payments" />

      {runIdFilter ? (
        <Alert className="mb-4">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Showing payments linked to this payroll run.</span>
            <Button asChild size="sm" variant="outline">
              <Link
                to="/payroll/runs/$runId"
                params={{ runId: runIdFilter }}
                search={{ tab: "payments" }}
              >
                View payroll run
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/payroll/payments" search={{ runId: undefined }}>
                Clear run filter
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {canPay ? (
        <Alert className="mb-4">
          <AlertDescription>
            Generic bank CSV is a non bank-specific export for manual review only. Downloading it
            does not mark payslips as paid or record a payment in LinkBooks.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={paymentSearch}
          onChange={(event) => setPaymentSearch(event.target.value)}
          placeholder="Search date, method or reference…"
          aria-label="Search payroll payments"
          className="w-full sm:w-72"
        />
        <RecordLookupSelect
          value={paymentStatus}
          onValueChange={(value) => setPaymentStatus(value as typeof paymentStatus)}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter payment status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </RecordLookupSelect>
        {filtersActive ? (
          <Button variant="ghost" size="sm" onClick={clearPaymentFilters}>
            Clear filters
          </Button>
        ) : null}
        <p className="w-full text-xs text-muted-foreground" aria-live="polite">
          Showing {filteredPayments.length} of {payments.length} payments
        </p>
      </div>

      <TableCard>
        {filteredPayments.length === 0 ? (
          <EmptyState
            title={payments.length === 0 ? "No payroll payments yet" : "No matching payments"}
            description={
              payments.length === 0
                ? "Post a payroll run, then record net-pay payments here."
                : "Try another status or search term."
            }
            action={
              filtersActive ? (
                <Button size="sm" variant="outline" onClick={clearPaymentFilters}>
                  Clear filters
                </Button>
              ) : canPay ? (
                <Button size="sm" disabled={recordMut.isPending} onClick={openRecordDialog}>
                  Record payment
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link to="/payroll/runs">View payroll runs</Link>
                </Button>
              )
            }
          />
        ) : (
          <Table aria-label="Payroll payment records">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={() => setDetailPaymentId(p.id)}
                      aria-label={`View payment details for ${fmt.date(p.payment_date)}`}
                    >
                      {fmt.date(p.payment_date)}
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={() => setDetailPaymentId(p.id)}
                      aria-label={`View payment details for ${METHOD_LABELS[p.payment_method] ?? p.payment_method} payment`}
                    >
                      {METHOD_LABELS[p.payment_method] ?? p.payment_method}
                    </button>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <button
                      type="button"
                      className="rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={() => setDetailPaymentId(p.id)}
                      aria-label={`View payment details for ${fmt.money(p.amount_minor, p.currency)}`}
                    >
                      {fmt.money(p.amount_minor, p.currency)}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <button
                      type="button"
                      className="rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={() => setDetailPaymentId(p.id)}
                      aria-label={`View payment details for reference ${p.reference ?? "none"}`}
                    >
                      {p.reference ?? "—"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={() => setDetailPaymentId(p.id)}
                      aria-label={`View details for ${p.status === "reversed" ? "reversed" : "posted"} payment`}
                    >
                      {p.status === "reversed" ? "Reversed" : "Posted"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDetailPaymentId(p.id)}>
                        Details
                      </Button>
                      {canPay && p.status === "posted" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (reverseMut.isPending || reversalSubmitLock.current) return;
                            setReversalDate(todayLocalDateOnly());
                            setReverseTarget({ id: p.id, currency: p.currency });
                          }}
                        >
                          Reverse
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      <Dialog
        open={recordOpen}
        onOpenChange={(open) => {
          if (!recordMut.isPending && !paymentSubmitLock.current) setRecordOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record payroll payment</DialogTitle>
            <DialogDescription>
              Debits net pay liability and credits your bank or cash account. Allocate to payslips
              to track employee payment status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {settingsQ.isSuccess && !settingsReady ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Payroll settings are not configured or their database migration is pending.
                  Complete Payroll settings before recording settlements.
                </AlertDescription>
              </Alert>
            ) : null}
            {settingsQ.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Could not load payroll settings. {friendlyAuthError(settingsQ.error)}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-2"
                    onClick={() => void settingsQ.refetch()}
                  >
                    Retry settings
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {fxUnsupported ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Payroll currency {payCurrency} differs from organisation base currency{" "}
                  {company.base_currency.toUpperCase()}. Payment posting is unavailable until an
                  approved FX accounting workflow is configured, to avoid an incorrect GL entry.
                </AlertDescription>
              </Alert>
            ) : null}
            {payslipsQ.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Could not load open payslips. {friendlyAuthError(payslipsQ.error)}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-2"
                    onClick={() => void payslipsQ.refetch()}
                  >
                    Retry payslips
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {accountsQ.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Could not load clearing accounts. {friendlyAuthError(accountsQ.error)}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-2"
                    onClick={() => void accountsQ.refetch()}
                  >
                    Retry accounts
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="pr-pay-date">Payment date</Label>
              <Input
                id="pr-pay-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Method</Label>
              <RecordLookupSelect value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-2">
              <Label>Clearing account</Label>
              {excludedClearingAccounts > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {excludedClearingAccounts} clearing account
                  {excludedClearingAccounts === 1 ? "" : "s"} with a different currency hidden.
                  Payroll settlements must use {payCurrency}.
                </p>
              ) : null}
              <AccountLookup
                ariaLabel="Clearing account"
                companyId={company.id}
                accounts={
                  availableClearingAccounts as unknown as Array<{
                    id: string;
                    code: string;
                    name: string;
                    account_type: string;
                    is_active: boolean;
                    is_postable: boolean;
                  }>
                }
                value={clearingAccountId}
                onChange={(v) => setClearingAccountId(v ?? "")}
                purpose="posting"
                createKind="bank"
                placeholder="Bank or cash account"
                allowClear={false}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pr-pay-amount">Amount</Label>
              <Input
                id="pr-pay-amount"
                inputMode="decimal"
                value={amountMajor}
                onChange={(e) => setAmountMajor(e.target.value)}
                placeholder={`e.g. 2,500.00 ${payCurrency}`}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pr-pay-ref">Reference</Label>
              <Input
                id="pr-pay-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pr-pay-memo">Memo</Label>
              <Input id="pr-pay-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Allocate to payslips (optional)</Label>
              {payslipsQ.isPending ? (
                <p className="text-sm text-muted-foreground">Loading open payslips…</p>
              ) : openPayslips.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No outstanding {payCurrency} payslips on posted runs
                  {runIdFilter ? " in this pay run" : ""}. You can still record an unallocated
                  payment.
                </p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2 text-sm">
                  {openPayslips.map((row) => (
                    <li key={row.payslip.id} className="flex flex-col gap-1">
                      <span>
                        {row.run.run_number} · {row.employee.first_name} {row.employee.last_name}{" "}
                        <span className="text-muted-foreground">
                          (outstanding {fromMinorUnits(row.outstanding, row.run.currency)})
                        </span>
                      </span>
                      <Input
                        inputMode="decimal"
                        placeholder={`Allocation (${row.run.currency})`}
                        value={alloc[row.payslip.id] ?? ""}
                        onChange={(e) =>
                          setAlloc((prev) => ({
                            ...prev,
                            [row.payslip.id]: e.target.value,
                          }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={recordMut.isPending || paymentSubmitLock.current}
              onClick={() => {
                // A synchronous submit lock can activate before React updates
                // isPending. Never hide a payment whose result is unresolved.
                if (!recordMut.isPending && !paymentSubmitLock.current) {
                  setRecordOpen(false);
                }
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                recordMut.isPending ||
                paymentSubmitLock.current ||
                !clearingAccountId ||
                !settingsReady ||
                !payslipsQ.isSuccess ||
                !accountsQ.isSuccess ||
                fxUnsupported
              }
              onClick={submitRecordPayment}
            >
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailPaymentId !== null}
        onOpenChange={(open) => !open && setDetailPaymentId(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment details</DialogTitle>
            <DialogDescription>
              Allocations, unallocated balance, and linked journal entry.
            </DialogDescription>
          </DialogHeader>
          {detailPaymentId !== null && paymentDetailQ.isSuccess ? (
            <div className="flex items-center justify-between gap-3">
              <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
                {paymentDetailQ.isFetching ? "Updating payment details…" : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={paymentDetailQ.isFetching}
                onClick={() => void paymentDetailQ.refetch()}
                aria-label="Refresh payroll payment details"
              >
                {paymentDetailQ.isFetching ? "Refreshing…" : "Refresh details"}
              </Button>
            </div>
          ) : null}
          {paymentDetailQ.isPending ? (
            <LoadingState />
          ) : paymentDetailQ.isError ? (
            <QueryErrorState queries={[paymentDetailQ]} title="Could not load payment details" />
          ) : paymentDetailQ.data ? (
            (() => {
              const detail = paymentDetailQ.data as PayrollPaymentDetailPage;
              const { payment, allocations } = detail;
              return (
                <div className="space-y-4 text-sm">
                  <dl className="grid grid-cols-2 gap-2">
                    <dt className="text-muted-foreground">Date</dt>
                    <dd>{fmt.date(payment.payment_date)}</dd>
                    <dt className="text-muted-foreground">Amount</dt>
                    <dd className="font-mono">
                      {fmt.money(payment.amount_minor, payment.currency)}
                    </dd>
                    <dt className="text-muted-foreground">Unallocated</dt>
                    <dd className="font-mono">
                      {fmt.money(payment.unallocated_minor, payment.currency)}
                    </dd>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{payment.status === "reversed" ? "Reversed" : "Posted"}</dd>
                    <dt className="text-muted-foreground">Reference</dt>
                    <dd>{payment.reference ?? "—"}</dd>
                    {payment.memo ? (
                      <>
                        <dt className="text-muted-foreground">Memo</dt>
                        <dd>{payment.memo}</dd>
                      </>
                    ) : null}
                  </dl>
                  {payment.journal_id && canAccountingView ? (
                    <p>
                      <Link
                        to="/accounting"
                        search={{ tab: "journals", journal: payment.journal_id }}
                        className="text-primary hover:underline"
                      >
                        Open payment journal
                      </Link>
                    </p>
                  ) : null}
                  <div>
                    <p className="mb-2 font-medium">Allocations</p>
                    {allocations.length === 0 ? (
                      <p className="text-muted-foreground">
                        No payslip allocations on this payment.
                      </p>
                    ) : (
                      <ul
                        aria-label="Payslip allocations for this payment"
                        className="space-y-2 rounded-md border p-3"
                      >
                        {allocations.map((row) => (
                          <li key={row.allocation.id} className="flex justify-between gap-2">
                            <span>
                              {row.payslip_number} · {row.employee_name}
                              <span className="block text-xs text-muted-foreground">
                                Run {row.run_number}
                              </span>
                            </span>
                            <span className="font-mono">
                              {fmt.money(row.allocation.amount_minor, payment.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {canPay && payment.status === "posted" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (reverseMut.isPending || reversalSubmitLock.current) return;
                        setDetailPaymentId(null);
                        setReversalDate(todayLocalDateOnly());
                        setReverseTarget({ id: payment.id, currency: payment.currency });
                      }}
                    >
                      Reverse payment
                    </Button>
                  ) : null}
                </div>
              );
            })()
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={reverseTarget !== null}
        onOpenChange={(open) => {
          if (!open && !reverseMut.isPending && !reversalSubmitLock.current) {
            setReverseTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse payroll payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This posts a reversing journal entry and restores payslip payment balances. The
              payment row stays on record as reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="pr-reverse-date">Reversal date</Label>
            <Input
              id="pr-reverse-date"
              type="date"
              value={reversalDate}
              onChange={(e) => setReversalDate(e.target.value)}
              disabled={reverseMut.isPending || reversalSubmitLock.current}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverseMut.isPending || reversalSubmitLock.current}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={reverseMut.isPending || reversalSubmitLock.current || !reversalDate}
              onClick={submitReversePayment}
            >
              Reverse payment
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListWorkspace>
  );
}
