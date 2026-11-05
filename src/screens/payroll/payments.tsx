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
import {
  exportPayrollBankCsvRows,
  listPayrollPayments,
  recordPayrollPayment,
} from "@/lib/payroll/payments.functions";
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

export function PayrollPaymentsPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const canPay = useCanDo("payroll.pay");
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
  const [amountMinor, setAmountMinor] = useState("");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => `pr-pay-${crypto.randomUUID()}`);

  const paymentsQ = useQuery({
    queryKey: ["payroll-payments", company?.id],
    queryFn: () => fetchPayments({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
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
      const amount = Number(amountMinor);
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("Enter the payment amount in minor units (whole pence/cents).");
      }
      const allocations = Object.entries(alloc)
        .map(([payslipId, v]) => ({ payslipId, amountMinor: Number(v) }))
        .filter((a) => Number.isInteger(a.amountMinor) && a.amountMinor > 0);
      return savePayment({
        data: {
          companyId: company!.id,
          paymentDate,
          paymentMethod,
          amountMinor: amount,
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
      setAmountMinor("");
      queryClient.invalidateQueries({ queryKey: ["payroll-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-payslips"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run"] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

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
                <Button size="sm" onClick={() => setRecordOpen(true)}>
                  Record payment
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <PayrollSubnav current="payments" />

      {canPay ? (
        <Alert className="mb-4">
          <AlertDescription>
            Generic bank CSV is for manual review only. Downloading it does not mark payslips as
            paid or record a payment in LinkBooks.
          </AlertDescription>
        </Alert>
      ) : null}

      <TableCard>
        {payments.length === 0 ? (
          <EmptyState
            title="No payroll payments yet"
            description="Post a payroll run, then record net-pay payments here."
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
              <Label htmlFor="pr-pay-amount">Amount (minor units)</Label>
              <Input
                id="pr-pay-amount"
                inputMode="numeric"
                value={amountMinor}
                onChange={(e) => setAmountMinor(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 250000 for £2,500.00"
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
                        inputMode="numeric"
                        placeholder="Allocation minor units"
                        value={alloc[row.payslip.id] ?? ""}
                        onChange={(e) =>
                          setAlloc((prev) => ({
                            ...prev,
                            [row.payslip.id]: e.target.value.replace(/\D/g, ""),
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
    </>
  );
}
