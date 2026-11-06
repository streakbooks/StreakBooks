import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { fromMinorUnits } from "@/lib/accounting/money";
import { buildGenericPayrollBankCsv } from "@/lib/payroll/payroll-bank-export";
import { validatePayrollPaymentAllocations } from "@/lib/payroll/payroll-payment-allocation";
import {
  exportPayrollBankCsvRows,
  getPayrollPayment,
  listPayrollPayments,
  recordPayrollPayment,
  reversePayrollPayment,
  type PayrollPaymentDetailPage,
} from "@/lib/payroll/payments.functions";
import { parseMinorOrThrow, tryParseMinor } from "@/lib/purchases/money-input";
import { listPayrollPayslips } from "@/lib/payroll/runs.functions";
import { listPaymentAccounts } from "@/lib/purchases/purchases.functions";
import type { PayslipSnapshot } from "@/lib/payroll/payslip-snapshot";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
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
  const navigate = useNavigate({ from: "/payroll/payments/" });
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const fetchPayments = useServerFn(listPayrollPayments);
  const fetchExport = useServerFn(exportPayrollBankCsvRows);
  const fetchPayslips = useServerFn(listPayrollPayslips);
  const fetchAccounts = useServerFn(listPaymentAccounts);
  const savePayment = useServerFn(recordPayrollPayment);

  const [recordOpen, setRecordOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [clearingAccountId, setClearingAccountId] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() => `pr-pay-${crypto.randomUUID()}`);
  const [reverseTarget, setReverseTarget] = useState<{ id: string; currency: string } | null>(null);
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null);
  const [reversalDate, setReversalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const reversePayment = useServerFn(reversePayrollPayment);
  const fetchPaymentDetail = useServerFn(getPayrollPayment);

  const payCurrency = (company?.base_currency ?? "GBP").toUpperCase();

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
    queryKey: ["payroll-open-payslips", company?.id],
    queryFn: () => fetchPayslips({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canPay && recordOpen,
  });

  const accountsQ = useQuery({
    queryKey: ["payroll-payment-accounts", company?.id],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canPay && recordOpen,
  });

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
      .filter((row) => ["posted", "paid", "complete"].includes(row.run.status))
      .map((row) => {
        const net = row.payslip.snapshot.totals?.netPayMinor ?? 0;
        const outstanding = Math.max(0, net - row.payslip.amount_paid_minor);
        return { ...row, outstanding, net };
      })
      .filter((row) => row.outstanding > 0);
  }, [payslipsQ.data]);

  const exportMut = useMutation({
    mutationFn: () => fetchExport({ data: { companyId: company!.id } }),
    onSuccess: (data) => {
      if (!data.rows.length) {
        toast.message("Nothing to export", {
          description: "No posted runs have outstanding net pay with open payslips.",
        });
        return;
      }
      const csv = buildGenericPayrollBankCsv(data.rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payroll-bank-export-generic.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Generic CSV downloaded", {
        description: data.disclaimer,
      });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const recordMut = useMutation({
    mutationFn: () => {
      const amountMinor = Number(parseMinorOrThrow(amountMajor, payCurrency, "Payment amount"));
      const allocations = Object.entries(alloc)
        .map(([payslipId, v]) => {
          const parsed = tryParseMinor(v, payCurrency);
          if (parsed === null || parsed <= 0n) return null;
          return { payslipId, amountMinor: Number(parsed) };
        })
        .filter((a): a is { payslipId: string; amountMinor: number } => a !== null);

      const validated = validatePayrollPaymentAllocations(
        BigInt(amountMinor),
        allocations.map((a) => ({
          payslipId: a.payslipId,
          amountMinor: BigInt(a.amountMinor),
        })),
        openPayslips.map((row) => ({
          payslipId: row.payslip.id,
          netMinor: BigInt(row.net),
          paidMinor: BigInt(row.payslip.amount_paid_minor),
        })),
      );
      if (!validated.ok) throw new Error(validated.error);

      return savePayment({
        data: {
          companyId: company!.id,
          paymentDate,
          paymentMethod,
          amountMinor,
          clearingAccountId,
          reference,
          memo,
          idempotencyKey,
          allocations,
        },
      });
    },
    onSuccess: () => {
      toast.success("Payroll payment recorded");
      setRecordOpen(false);
      setAlloc({});
      setAmountMajor("");
      setIdempotencyKey(`pr-pay-${crypto.randomUUID()}`);
      queryClient.invalidateQueries({ queryKey: ["payroll-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-payslips"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run"] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
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
      queryClient.invalidateQueries({ queryKey: ["payroll-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-payslips"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run"] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const openRecordDialog = () => {
    setIdempotencyKey(`pr-pay-${crypto.randomUUID()}`);
    setRecordOpen(true);
  };

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <>
        <PageHeader title="Payroll payments" />
        <EmptyState title="No payroll access" description="Ask for payroll.view permission." />
      </>
    );
  }

  const page = paymentsQ.data;
  if (paymentsQ.isPending) return <LoadingState />;
  if (paymentsQ.isError) {
    return (
      <ErrorState
        title="Could not load payments"
        description={friendlyAuthError(paymentsQ.error)}
        onRetry={() => paymentsQ.refetch()}
      />
    );
  }
  if (page && !page.available) {
    return (
      <>
        <PageHeader title="Payroll payments" />
        <PayrollSubnav current="payments" />
        <EmptyState title="Migration pending" description={page.migrationMessage ?? ""} />
      </>
    );
  }

  const payments = page?.payments ?? [];

  return (
    <>
      <PageHeader
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
                <Button size="sm" onClick={openRecordDialog}>
                  Record payment
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <PayrollSubnav current="payments" />

      {runIdFilter ? (
        <Alert className="mb-4">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Showing payments linked to this payroll run.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void navigate({ search: { runId: undefined } })}
            >
              Clear run filter
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

      <TableCard>
        {payments.length === 0 ? (
          <EmptyState
            title="No payroll payments yet"
            description="Post a payroll run, then record net-pay payments here."
            action={
              canPay ? (
                <Button size="sm" onClick={openRecordDialog}>
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
          <Table>
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
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{fmt.date(p.payment_date)}</TableCell>
                  <TableCell>{METHOD_LABELS[p.payment_method] ?? p.payment_method}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmt.money(p.amount_minor, p.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.reference ?? "—"}</TableCell>
                  <TableCell>{p.status === "reversed" ? "Reversed" : "Posted"}</TableCell>
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
                            setReversalDate(new Date().toISOString().slice(0, 10));
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

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record payroll payment</DialogTitle>
            <DialogDescription>
              Debits net pay liability and credits your bank or cash account. Allocate to payslips
              to track employee payment status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Clearing account</Label>
              <AccountLookup
                ariaLabel="Clearing account"
                companyId={company.id}
                accounts={
                  (accountsQ.data ?? []) as unknown as Array<{
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
                  No outstanding payslips on posted runs. You can still record an unallocated
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
            <Button variant="outline" onClick={() => setRecordOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={recordMut.isPending || !clearingAccountId}
              onClick={() => recordMut.mutate()}
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
          {paymentDetailQ.isPending ? (
            <LoadingState />
          ) : paymentDetailQ.isError ? (
            <p className="text-sm text-destructive">{friendlyAuthError(paymentDetailQ.error)}</p>
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
                      <ul className="space-y-2 rounded-md border p-3">
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
                        setDetailPaymentId(null);
                        setReversalDate(new Date().toISOString().slice(0, 10));
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
        onOpenChange={(open) => !open && setReverseTarget(null)}
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
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverseMut.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={reverseMut.isPending || !reversalDate}
              onClick={() => reverseMut.mutate()}
            >
              Reverse payment
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
