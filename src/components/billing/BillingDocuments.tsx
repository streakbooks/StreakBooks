import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getCompanyBillingAccount } from "@/lib/billing/billing-accounts.functions";
import {
  downloadBillingDocument,
  listBillingDocuments,
  listProviderInvoices,
  setBillingTaxId,
  type ProviderInvoice,
} from "@/lib/billing/billing-documents.functions";
import { formatMinorAmount } from "@/lib/billing/domain/money";

const TAX_SCHEMES = ["GSTIN", "VAT", "GST", "ABN", "NZBN", "EIN", "OTHER"] as const;
type TaxScheme = (typeof TAX_SCHEMES)[number];

function money(minor: number, currency: string): string {
  return formatMinorAmount(BigInt(minor), currency);
}

function day(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "";
}

const PLATFORM_STATUS: Record<string, string> = {
  paid: "Paid",
  partially_credited: "Partly credited",
  credited: "Credited",
};

const PROVIDER_STATUS: Record<string, string> = {
  paid: "Paid",
  open: "Open",
  draft: "Draft",
  void: "Voided",
  uncollectible: "Failed / uncollectible",
};

function providerBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "success" | "warning" {
  if (status === "paid") return "success";
  if (status === "open" || status === "draft") return "warning";
  if (status === "void" || status === "uncollectible") return "destructive";
  return "secondary";
}

export function BillingDocuments({ companyId }: { companyId: string }) {
  const load = useServerFn(listBillingDocuments);
  const loadProvider = useServerFn(listProviderInvoices);
  const download = useServerFn(downloadBillingDocument);
  const query = useQuery({
    queryKey: ["billing-documents", companyId],
    queryFn: () => load({ data: { companyId } }),
    retry: false,
  });
  const providerQuery = useQuery({
    queryKey: ["billing-provider-invoices", companyId],
    queryFn: () => loadProvider({ data: { companyId } }),
    retry: false,
  });
  const open = useMutation({
    mutationFn: (input: { kind: "invoice" | "credit_note"; id: string }) =>
      download({ data: input }),
    onSuccess: (result) => window.open(result.url, "_blank", "noopener"),
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const invoices = query.data?.invoices ?? [];
  const creditNotes = query.data?.creditNotes ?? [];
  const providerInvoices = providerQuery.data?.invoices ?? [];
  const outstanding = providerInvoices.filter(
    (invoice) => invoice.status === "open" || invoice.status === "uncollectible",
  );

  return (
    <section
      className="space-y-6 rounded-xl border bg-card px-5 py-4"
      aria-labelledby="invoices-heading"
    >
      <h2 id="invoices-heading" className="text-base font-semibold">
        Billing documents
      </h2>
      {query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load billing invoices" />
      ) : null}
      <TaxIdForm companyId={companyId} />

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Outstanding with Stripe</h3>
        {providerQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading provider invoices…</p>
        ) : null}
        {providerQuery.isError ? (
          <p className="text-sm text-muted-foreground">
            Provider invoices could not be loaded. Issued StreakBooks invoices below are unaffected.
          </p>
        ) : null}
        {providerQuery.isSuccess && outstanding.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open or failed Stripe invoices.</p>
        ) : null}
        {outstanding.length ? (
          <ProviderInvoiceTable
            invoices={outstanding}
            emptyLabel=""
            showPay
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Stripe history</h3>
        <p className="text-xs text-muted-foreground">
          Includes paid, voided, proration and renewal invoices from Stripe. Platform tax invoices
          below are separate immutable records.
        </p>
        {providerQuery.isSuccess && providerInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Stripe invoices yet.</p>
        ) : null}
        {providerInvoices.length ? (
          <ProviderInvoiceTable invoices={providerInvoices} emptyLabel="" showPay />
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Issued StreakBooks invoices</h3>
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading invoices…</p> : null}
        {query.isSuccess && invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tax invoices appear here after each successful payment is recorded.
          </p>
        ) : null}
        {query.isSuccess && invoices.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1">Number</th>
                <th>Date</th>
                <th>Period</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t">
                  <td className="py-1.5">{invoice.number}</td>
                  <td>{day(invoice.issuedAt)}</td>
                  <td>
                    {invoice.periodStart
                      ? `${day(invoice.periodStart)} – ${day(invoice.periodEnd)}`
                      : ""}
                  </td>
                  <td>
                    <Badge variant="secondary">
                      {PLATFORM_STATUS[invoice.status] ?? invoice.status}
                    </Badge>
                  </td>
                  <td className="text-right tabular-nums">
                    {money(invoice.totalMinor, invoice.currency)}
                    {invoice.taxMinor > 0 && invoice.taxLabel ? (
                      <span className="block text-xs text-muted-foreground">
                        incl. {invoice.taxLabel} {money(invoice.taxMinor, invoice.currency)}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={open.isPending}
                      onClick={() => open.mutate({ kind: "invoice", id: invoice.id })}
                    >
                      PDF
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {query.isSuccess && creditNotes.length ? (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Credit notes</h3>
          <ul className="space-y-1 text-sm">
            {creditNotes.map((note) => (
              <li key={note.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {note.number} · against {note.invoiceNumber} · {day(note.issuedAt)} ·{" "}
                  {money(note.totalMinor, note.currency)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={open.isPending}
                  onClick={() => open.mutate({ kind: "credit_note", id: note.id })}
                >
                  PDF
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ProviderInvoiceTable({
  invoices,
  showPay,
}: {
  invoices: ProviderInvoice[];
  emptyLabel: string;
  showPay: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-1">Number</th>
          <th>Date</th>
          <th>Due</th>
          <th>Status</th>
          <th className="text-right">Amount</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => (
          <tr key={invoice.id} className="border-t">
            <td className="py-1.5">
              {invoice.number ?? invoice.id.slice(0, 14)}
              {invoice.proration ? (
                <Badge variant="secondary" className="ml-1">
                  Proration
                </Badge>
              ) : null}
            </td>
            <td>{day(invoice.createdAt)}</td>
            <td>{day(invoice.dueAt)}</td>
            <td>
              <Badge variant={providerBadgeVariant(invoice.status)}>
                {PROVIDER_STATUS[invoice.status] ?? invoice.status}
              </Badge>
            </td>
            <td className="text-right tabular-nums">
              {money(invoice.totalMinor, invoice.currency)}
              {invoice.amountDueMinor > 0 && invoice.status === "open" ? (
                <span className="block text-xs text-muted-foreground">
                  Due {money(invoice.amountDueMinor, invoice.currency)}
                </span>
              ) : null}
            </td>
            <td className="text-right">
              <div className="flex justify-end gap-1">
                {showPay && invoice.status === "open" && invoice.hostedInvoiceUrl ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => window.location.assign(invoice.hostedInvoiceUrl!)}
                  >
                    Pay
                  </Button>
                ) : null}
                {invoice.pdfUrl ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(invoice.pdfUrl!, "_blank", "noopener")}
                  >
                    PDF
                  </Button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TaxIdForm({ companyId }: { companyId: string }) {
  const loadAccount = useServerFn(getCompanyBillingAccount);
  const save = useServerFn(setBillingTaxId);
  const queryClient = useQueryClient();
  const account = useQuery({
    queryKey: ["billing-account", companyId],
    queryFn: () => loadAccount({ data: { companyId } }),
    retry: false,
  });
  const [scheme, setScheme] = useState<TaxScheme>("GSTIN");
  const [taxId, setTaxId] = useState("");
  useEffect(() => {
    if (!account.isSuccess || !account.data) return;
    setScheme((account.data.taxIdScheme as TaxScheme | null) ?? "GSTIN");
    setTaxId(account.data.taxId ?? "");
  }, [account.isSuccess, account.data]);
  const mutation = useMutation({
    mutationFn: () => save({ data: { accountId: account.data!.id, scheme, taxId } }),
    onSuccess: () => {
      toast.success(
        taxId.trim() ? "Tax ID saved. It appears on future invoices." : "Tax ID removed.",
      );
      void queryClient.invalidateQueries({ queryKey: ["billing-account", companyId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (account.isError) {
    return <QueryErrorState queries={[account]} title="Could not load billing account" />;
  }
  if (!account.data?.permissions.manage) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <label className="text-sm">
        Tax registration
        <select
          className="mt-1 flex h-9 rounded-md border bg-transparent px-2"
          value={scheme}
          onChange={(event) => setScheme(event.target.value as TaxScheme)}
        >
          {/* lookup-fixed-enum: Tax registration scheme is a fixed schema enumeration. */}
          {TAX_SCHEMES.map((item) => (
            <option key={item} value={item}>
              {item === "OTHER" ? "Other" : item}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Number (for business invoices)
        <Input
          className="mt-1 w-56"
          value={taxId}
          onChange={(event) => setTaxId(event.target.value)}
          placeholder="Leave empty if not registered"
        />
      </label>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={mutation.isPending || !account.isSuccess || account.isError}
      >
        Save
      </Button>
    </form>
  );
}
