import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  createBatchPayment,
  listBills,
  listPaymentAccounts,
} from "@/lib/purchases/purchases.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { buildBatchPayments, type BatchBill } from "@/lib/purchases/batch-payment";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/states";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
import { AccountLookup } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_authenticated/purchases/payments/batch")({
  head: () => ({ meta: [{ title: "Batch payment — LinkBooks" }] }),
  component: BatchPayment,
});

type BillRow = BatchBill & {
  bill_number: string | null;
  supplier_invoice_number: string | null;
  due_date: string;
  contacts: { name: string } | null;
};

function BatchPayment() {
  const { company } = useActiveCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchBills = useServerFn(listBills);
  const fetchAccounts = useServerFn(listPaymentAccounts);
  const postBatch = useServerFn(createBatchPayment);
  const canPay = useCanDo("purchases.payment");
  const companyId = company?.id;
  const today = new Date().toISOString().slice(0, 10);

  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [batchKey] = useState(() => `batch-${crypto.randomUUID()}`);

  const billsQ = useQuery({
    queryKey: ["bills-open-batch", companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetchBills({
        data: {
          companyId: companyId!,
          tab: "to_pay",
          sortBy: "due_date",
          sortDir: "asc",
          limit: 200,
        },
      }),
  });
  const accountsQ = useQuery({
    queryKey: ["payment-accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });

  const bills = useMemo(() => {
    const rows = ((billsQ.data as { rows?: unknown[] } | undefined)?.rows ?? []) as BillRow[];
    return rows.filter((b) => b.total_minor - b.amount_paid_minor - b.amount_credited_minor > 0);
  }, [billsQ.data]);
  const chosen = bills.filter((b) => selected[b.id]);
  const payments = buildBatchPayments(chosen);

  const mutation = useMutation({
    mutationFn: () =>
      postBatch({
        data: {
          companyId: companyId!,
          paymentDate,
          bankAccountId,
          batchKey,
          payments: payments.map((p) => ({
            contactId: p.contactId,
            currencyCode: p.currencyCode,
            allocations: p.allocations,
          })),
        },
      }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["payments", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["bills", companyId] });
      toast.success(`${r.count} payment${r.count === 1 ? "" : "s"} posted`);
      navigate({ to: "/purchases/payments" });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (billsQ.isPending) return <LoadingState />;
  if (billsQ.isError)
    return (
      <ErrorState
        title="Could not load bills to pay"
        description={friendlyAuthError(billsQ.error)}
        onRetry={() => void billsQ.refetch()}
      />
    );

  return (
    <TransactionWorkspace
      title="Batch payment"
      description="Pay several bills in one go. One payment is created per supplier and currency; all post together or not at all."
      breadcrumbs={[
        { label: "Purchases", to: "/purchases" },
        { label: "Payments", to: "/purchases/payments" },
        { label: "Batch" },
      ]}
      meta={<StatusBadge status="draft" label="Batch" />}
      actions={
        <Button size="sm" variant="outline" asChild>
          <Link to="/purchases/payments">Cancel</Link>
        </Button>
      }
      details={
        <div className="space-y-3">
          {accountsQ.isError ? (
            <ErrorState
              compact
              title="Could not load payment accounts"
              description={friendlyAuthError(accountsQ.error)}
              onRetry={() => void accountsQ.refetch()}
            />
          ) : null}
          <FormGrid columns={4}>
            <FormControlShell width="contact" className="sm:col-span-2">
              <Label htmlFor="batch-bank">Bank / cash account</Label>
              <AccountLookup
                id="batch-bank"
                ariaLabel="Bank / cash account"
                accounts={
                  (accountsQ.data ?? []) as Array<{ id: string; code: string; name: string }>
                }
                value={bankAccountId}
                onChange={setBankAccountId}
                companyId={companyId}
                purpose="posting"
                createKind="bank"
                disabled={accountsQ.isPending || accountsQ.isError || mutation.isPending}
                placeholder={
                  accountsQ.isPending
                    ? "Loading payment accounts…"
                    : "Paid from (bank or cash account)"
                }
                allowClear={false}
              />
            </FormControlShell>
            <FormControlShell width="date">
              <Label htmlFor="batch-payment-date">Payment date</Label>
              <Input
                id="batch-payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </FormControlShell>
            <FormControlShell className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                Each selected bill is paid in full. Foreign-currency bills are settled at the rate
                they were booked at; use “New payment” to enter a different rate and book exchange
                gain or loss.
              </p>
            </FormControlShell>
          </FormGrid>
        </div>
      }
      lines={
        bills.length === 0 ? (
          <EmptyState title="Nothing to pay" description="No authorised bills have a balance." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((b) => {
                const due = b.total_minor - b.amount_paid_minor - b.amount_credited_minor;
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Checkbox
                        checked={Boolean(selected[b.id])}
                        aria-label={`Pay ${b.bill_number ?? b.supplier_invoice_number ?? "bill"}`}
                        onCheckedChange={(v) =>
                          setSelected((s) => ({ ...s, [b.id]: v === true }))
                        }
                      />
                    </TableCell>
                    <TableCell>{b.contacts?.name ?? "—"}</TableCell>
                    <TableCell>{b.supplier_invoice_number || b.bill_number || "—"}</TableCell>
                    <TableCell>{b.due_date}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.currency_code} {fromMinorUnits(BigInt(due), b.currency_code)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )
      }
      totals={
        <TotalsSummary
          aria-label="Batch payment totals"
          lines={[
            {
              id: "bills",
              label: "Bills selected",
              value: String(chosen.length),
            },
            {
              id: "payments",
              label: "Payments to post",
              value: String(payments.length),
              emphasis: "muted",
            },
            ...(payments.length === 0
              ? [
                  {
                    id: "outstanding",
                    label: "Outstanding",
                    value: "—",
                    emphasis: "total" as const,
                  },
                ]
              : payments.map((p, index) => ({
                  id: `cur-${p.contactId}-${p.currencyCode}`,
                  label: p.currencyCode,
                  value: fromMinorUnits(p.totalMinor, p.currencyCode),
                  emphasis: (index === payments.length - 1 ? "total" : "default") as
                    | "total"
                    | "default",
                }))),
          ]}
        />
      }
      stickyActions={
        <div className="flex flex-wrap items-center gap-3">
          {!canPay ? (
            <p className="text-sm text-muted-foreground">
              You do not have permission to record supplier payments.
            </p>
          ) : null}
          <Button
            size="sm"
            disabled={
              !canPay ||
              accountsQ.isPending ||
              accountsQ.isError ||
              !bankAccountId ||
              !paymentDate ||
              payments.length === 0 ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Pay selected
          </Button>
        </div>
      }
    />
  );
}
