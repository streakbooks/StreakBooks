import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useEffect, useMemo, useState } from "react";

import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { listProducts } from "@/lib/products/products.functions";
import { listCustomers } from "@/lib/sales/sales.functions";
import {
  deleteRecurringInvoice,
  generateRecurringInvoice,
  getRecurringInvoice,
  listRecurringInvoices,
  saveRecurringInvoice,
  setRecurringActive,
} from "@/lib/sales/sales-recurring.functions";
import { getSalesDocumentConfig } from "@/lib/sales/sales-config.functions";
import { fromMinorUnits, toMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { EntityCombobox } from "@/components/common/EntityCombobox";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
import { ContactCreateForm } from "@/components/lookup/create-forms";
import { SalesDocumentLines } from "@/components/sales/SalesDocumentLines";
import { emptySalesLine, type SalesLineFormState } from "@/lib/sales/line-form-state";
import { lineFormToInput, lineRowToForm } from "@/components/sales/sales-form-utils";
import { computeTaxLineRounded } from "@/lib/sales/line-math-rounded";
import { Button } from "@/components/ui/button";
import { RunDueButton } from "@/components/recurring/RunDueButton";
import { runDueRecurringInvoices } from "@/lib/recurring/run-due.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const DEFAULT_LINES = () => Array.from({ length: 2 }, () => emptySalesLine());

type RecurringInvoiceWorkspaceProps = {
  editingId?: string | null;
  onCancel: () => void;
  onSaved: () => void;
};

function RecurringInvoiceWorkspace({
  editingId = null,
  onCancel,
  onSaved,
}: RecurringInvoiceWorkspaceProps) {
  const { company } = useActiveCompany();
  const { can } = useCan();
  const companyId = company?.id;
  const enabled = Boolean(companyId);
  const fetchOne = useServerFn(getRecurringInvoice);
  const fetchCustomers = useServerFn(listCustomers);
  const fetchAccounts = useServerFn(listAccounts);
  const fetchProducts = useServerFn(listProducts);
  const fetchConfig = useServerFn(getSalesDocumentConfig);
  const save = useServerFn(saveRecurringInvoice);

  const customersQ = useQuery({
    queryKey: ["customers", companyId],
    enabled,
    queryFn: () => fetchCustomers({ data: { companyId: companyId! } }),
  });
  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    enabled,
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });
  const productsQ = useQuery({
    queryKey: ["products", companyId],
    enabled,
    queryFn: () => fetchProducts({ data: { companyId: companyId!, limit: 200 } }),
  });
  const configQ = useQuery({
    queryKey: ["sales-doc-config", companyId],
    enabled,
    queryFn: () => fetchConfig({ data: { companyId: companyId! } }),
  });

  const base = configQ.data?.baseCurrency ?? company?.base_currency ?? "GBP";
  const today = configQ.data?.today ?? new Date().toISOString().slice(0, 10);

  const [name, setName] = useState("");
  const [contactId, setContactId] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextDue, setNextDue] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxOcc, setMaxOcc] = useState("");
  const [terms, setTerms] = useState("");
  const [memo, setMemo] = useState("");
  const [autoAuth, setAutoAuth] = useState(false);
  const [lines, setLines] = useState<SalesLineFormState[]>(DEFAULT_LINES);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!nextDue && configQ.data) setNextDue(configQ.data.today);
  }, [nextDue, configQ.data]);

  useEffect(() => {
    if (!companyId || !editingId || hydratedId === editingId) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetchOne({ data: { companyId, recurringId: editingId } });
        if (cancelled) return;
        setName(r.name);
        setContactId(r.contact_id);
        setFrequency(r.frequency);
        setNextDue(r.next_due_date);
        setEndDate(r.end_date ?? "");
        setMaxOcc(r.max_occurrences ? String(r.max_occurrences) : "");
        setTerms(r.payment_terms_days !== null ? String(r.payment_terms_days) : "");
        setMemo(r.memo ?? "");
        setAutoAuth(r.auto_authorise);
        setLines(
          r.sales_recurring_invoice_lines.length
            ? r.sales_recurring_invoice_lines.map((l) => lineRowToForm(l, r.currency_code))
            : DEFAULT_LINES(),
        );
        setHydratedId(editingId);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(friendlyAuthError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, editingId, fetchOne, hydratedId]);

  const incomeAccounts = useMemo(
    () =>
      (
        (accountsQ.data ?? []) as Array<{
          id: string;
          code: string;
          name: string;
          account_type: string;
          is_postable: boolean;
          is_active: boolean;
        }>
      ).filter(
        (a) =>
          a.is_active && a.is_postable && (a.account_type === "income" || a.code.startsWith("4")),
      ),
    [accountsQ.data],
  );
  const customerOptions = ((customersQ.data ?? []) as Array<{ id: string; name: string }>).map(
    (c) => ({
      value: c.id,
      label: c.name,
    }),
  );

  const treatment = configQ.data?.treatment ?? "exclusive";
  const taxCodes = configQ.data?.taxCodes;
  const codeById = useMemo(
    () => new Map((taxCodes ?? []).map((c) => [c.id, c] as const)),
    [taxCodes],
  );
  const lineTotals = useMemo(() => {
    try {
      const computed = lines.map((l) => {
        const code = l.taxCodeId ? codeById.get(l.taxCodeId) : undefined;
        const tax_rate_bps = code ? code.rate_bps : Number(l.taxRateBps || 0);
        return computeTaxLineRounded({
          quantity: Number(l.quantity),
          unit_price_minor: Number(toMinorUnits(l.unitPrice || "0", base)),
          discount_minor: Number(toMinorUnits(l.discount || "0", base)),
          tax_rate_bps,
          treatment,
        });
      });
      return {
        subtotal: computed.reduce((s, c) => s + Number(c.net_minor), 0),
        tax: computed.reduce((s, c) => s + Number(c.tax_minor), 0),
        total: computed.reduce((s, c) => s + Number(c.gross_minor), 0),
      };
    } catch {
      return null;
    }
  }, [lines, base, treatment, codeById]);

  const saveM = useMutation({
    mutationFn: () => {
      if (!contactId) throw new Error("Choose a customer");
      return save({
        data: {
          companyId: companyId!,
          ...(editingId ? { recurringId: editingId } : {}),
          contactId,
          name,
          frequency,
          nextDueDate: nextDue,
          endDate: endDate || null,
          maxOccurrences: maxOcc ? Number(maxOcc) : null,
          paymentTermsDays: terms === "" ? null : Number(terms),
          currencyCode: base,
          autoAuthorise: autoAuth,
          memo,
          lines: lines.map((l) => lineFormToInput(l, base)),
        },
      });
    },
    onSuccess: () => {
      toast.success(editingId ? "Recurring invoice updated" : "Recurring invoice created");
      onSaved();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const requiredQueries = [customersQ, accountsQ, productsQ, configQ];
  if (requiredQueries.some((query) => query.isError && query.data === undefined)) {
    return (
      <QueryErrorState queries={requiredQueries} title="Could not load recurring invoice options" />
    );
  }

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (customersQ.isPending || accountsQ.isPending || productsQ.isPending || configQ.isPending) {
    return <LoadingState />;
  }
  if (editingId && !hydratedId && !loadError) return <LoadingState />;
  if (loadError) {
    return (
      <ErrorState title="Could not load schedule" description={loadError} onRetry={onCancel} />
    );
  }

  return (
    <TransactionWorkspace
      title={editingId ? "Edit recurring invoice" : "New recurring invoice"}
      description="Schedule generates draft invoices on demand with customer terms and tax. Auto-authorise posts only when you have sales.authorise. Base currency only."
      breadcrumbs={[
        { label: "Sales", to: "/sales" },
        { label: "Recurring invoices", to: "/sales/recurring" },
        { label: editingId ? "Edit" : "New" },
      ]}
      meta={<StatusBadge status="draft" label={editingId ? "Editing schedule" : "Draft"} />}
      stickyActions={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {editingId ? "Save changes" : "Create schedule"}
          </Button>
        </div>
      }
      details={
        <FormGrid columns={4}>
          <FormControlShell>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormControlShell>
          <FormControlShell width="contact">
            <Label>Customer</Label>
            <EntityCombobox
              aria-label="Customer"
              options={customerOptions}
              value={contactId}
              onChange={setContactId}
              placeholder="Search customers"
              allowClear={false}
              companyId={companyId}
              canAddNew={can("contacts.manage")}
              createTitle="New customer"
              renderCreate={
                can("contacts.manage")
                  ? (ctx) => <ContactCreateForm companyId={companyId} kind="customer" ctx={ctx} />
                  : undefined
              }
            />
          </FormControlShell>
          <FormControlShell>
            <Label>Frequency</Label>
            <select
              className="h-[var(--lb-control-height)] w-full rounded-md border border-input bg-background px-3 text-sm"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </FormControlShell>
          <FormControlShell width="date">
            <Label>Next invoice date</Label>
            <Input
              type="date"
              value={nextDue || today}
              onChange={(e) => setNextDue(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell width="date">
            <Label>End date (optional)</Label>
            <Input
              type="date"
              value={endDate}
              min={nextDue || today}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell width="money">
            <Label>Stop after N invoices (optional)</Label>
            <Input value={maxOcc} inputMode="numeric" onChange={(e) => setMaxOcc(e.target.value)} />
          </FormControlShell>
          <FormControlShell width="money">
            <Label>Payment terms, days (blank = customer terms)</Label>
            <Input value={terms} inputMode="numeric" onChange={(e) => setTerms(e.target.value)} />
          </FormControlShell>
          <FormControlShell className="sm:col-span-2">
            <Label>Memo</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </FormControlShell>
          <FormControlShell className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoAuth}
                onChange={(e) => setAutoAuth(e.target.checked)}
              />
              Auto-authorise when generated
            </label>
          </FormControlShell>
        </FormGrid>
      }
      lines={
        <SalesDocumentLines
          lines={lines}
          onChange={setLines}
          products={(productsQ.data ?? []) as never}
          accounts={incomeAccounts}
          currency={base}
          treatment={treatment}
          taxCodes={taxCodes ?? []}
          toMinor={(d) => toMinorUnits(d, base)}
          companyId={companyId}
          baseCurrency={base}
        />
      }
      totals={
        <TotalsSummary
          aria-label="Recurring invoice totals"
          lines={
            lineTotals
              ? [
                  {
                    id: "subtotal",
                    label: "Subtotal",
                    value: `${base} ${fromMinorUnits(lineTotals.subtotal, base)}`,
                  },
                  {
                    id: "tax",
                    label: treatment === "inclusive" ? "Tax (included)" : "Tax",
                    value: `${base} ${fromMinorUnits(lineTotals.tax, base)}`,
                    emphasis: "muted",
                  },
                  {
                    id: "total",
                    label: "Total",
                    value: `${base} ${fromMinorUnits(lineTotals.total, base)}`,
                    emphasis: "total",
                  },
                ]
              : [
                  {
                    id: "total",
                    label: "Total",
                    value: "Complete valid lines",
                    emphasis: "total",
                  },
                ]
          }
        />
      }
    />
  );
}

/** Full-page create destination for Create menu and Sales → Recurring → New. */
export function NewRecurringInvoice() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { company } = useActiveCompany();
  const companyId = company?.id;

  return (
    <RecurringInvoiceWorkspace
      onCancel={() => void navigate({ to: "/sales/recurring" })}
      onSaved={async () => {
        await qc.invalidateQueries({ queryKey: ["sales-recurring", companyId] });
        void navigate({ to: "/sales/recurring" });
      }}
    />
  );
}

/** Full-page edit destination with browser history and deep links. */
export function EditRecurringInvoice({ recurringId }: { recurringId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { company } = useActiveCompany();
  const companyId = company?.id;

  return (
    <RecurringInvoiceWorkspace
      editingId={recurringId}
      onCancel={() => void navigate({ to: "/sales/recurring" })}
      onSaved={async () => {
        await qc.invalidateQueries({ queryKey: ["sales-recurring", companyId] });
        void navigate({ to: "/sales/recurring" });
      }}
    />
  );
}

export function RecurringInvoices() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const qc = useQueryClient();
  const enabled = Boolean(companyId);
  const fetchList = useServerFn(listRecurringInvoices);
  const runDue = useServerFn(runDueRecurringInvoices);
  const generate = useServerFn(generateRecurringInvoice);
  const setActive = useServerFn(setRecurringActive);
  const remove = useServerFn(deleteRecurringInvoice);

  const listQ = useQuery({
    queryKey: ["sales-recurring", companyId],
    enabled,
    queryFn: () => fetchList({ data: { companyId: companyId! } }),
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const genM = useMutation({
    mutationFn: (recurringId: string) => generate({ data: { companyId: companyId!, recurringId } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["sales-recurring", companyId] });
      await qc.invalidateQueries({ queryKey: ["sales-invoices", companyId] });
      toast.success(
        `Generated invoice ${r.invoiceId.slice(0, 8)}…${r.nextDueDate ? ` next due ${r.nextDueDate}` : " — schedule finished"}`,
      );
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const activeM = useMutation({
    mutationFn: (args: { recurringId: string; isActive: boolean }) =>
      setActive({ data: { companyId: companyId!, ...args } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["sales-recurring", companyId] });
      toast.success(r.is_active ? "Schedule resumed" : "Schedule paused");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const deleteM = useMutation({
    mutationFn: (recurringId: string) => remove({ data: { companyId: companyId!, recurringId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sales-recurring", companyId] });
      setDeleteId(null);
      toast.success("Recurring invoice deleted");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const rows = listQ.data ?? [];

  return (
    <ListWorkspace
      title="Recurring invoices"
      description="Generates draft invoices on demand with customer terms and tax. Auto-authorise posts only when you have sales.authorise. Base currency only."
      actions={
        <div className="flex gap-2">
          <RunDueButton
            label="invoices"
            run={() => runDue({ data: { companyId: companyId! } })}
            invalidateKeys={[
              ["sales-recurring", companyId],
              ["sales-invoices", companyId],
            ]}
          />
          <Button size="sm" asChild>
            <Link to="/sales/recurring/new">New recurring invoice</Link>
          </Button>
        </div>
      }
    >
      {listQ.isPending ? (
        <LoadingState />
      ) : listQ.isError ? (
        <ErrorState
          title="Could not load"
          description={friendlyAuthError(listQ.error)}
          onRetry={() => listQ.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No recurring invoices"
          description="Create a schedule to start."
          action={
            <Button size="sm" asChild>
              <Link to="/sales/recurring/new">New recurring invoice</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Next due</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead>Generated</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const generated = r.occurrences_generated ?? 0;
              const neverRun = generated === 0 && !r.last_generated_on;
              const ended =
                (r.end_date !== null && r.next_due_date > r.end_date) ||
                (r.max_occurrences !== null && generated >= r.max_occurrences);
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.contacts?.name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{r.frequency}</TableCell>
                  <TableCell>{r.next_due_date}</TableCell>
                  <TableCell>
                    {r.end_date ?? (r.max_occurrences ? `after ${r.max_occurrences}` : "never")}
                  </TableCell>
                  <TableCell>{generated}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ended ? "finished" : r.is_active ? "active" : "paused"}
                    </Badge>
                    {r.last_error ? (
                      <span className="ml-2 text-xs text-destructive">{r.last_error}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/sales/recurring/$id/edit" params={{ id: r.id }}>
                        Edit
                      </Link>
                    </Button>
                    {!ended ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={activeM.isPending}
                        onClick={() =>
                          activeM.mutate({ recurringId: r.id, isActive: !r.is_active })
                        }
                      >
                        {r.is_active ? "Pause" : "Resume"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={genM.isPending || !r.is_active || ended}
                      onClick={() => genM.mutate(r.id)}
                    >
                      Generate now
                    </Button>
                    {neverRun ? (
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}>
                        Delete
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recurring invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              It has never generated an invoice. Templates that have run can only be paused.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteM.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListWorkspace>
  );
}
