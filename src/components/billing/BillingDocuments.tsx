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
  setBillingTaxId,
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

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  partially_credited: "Partly credited",
  credited: "Credited",
};

export function BillingDocuments({ companyId }: { companyId: string }) {
  const load = useServerFn(listBillingDocuments);
  const download = useServerFn(downloadBillingDocument);
  const query = useQuery({
    queryKey: ["billing-documents", companyId],
    queryFn: () => load({ data: { companyId } }),
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
  return (
    <section
      className="space-y-4 rounded-xl border bg-card px-5 py-4"
      aria-labelledby="invoices-heading"
    >
      <h2 id="invoices-heading" className="text-base font-semibold">
        Invoices
      </h2>
      {query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load billing invoices" />
      ) : null}
      <TaxIdForm companyId={companyId} />
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading invoices…</p> : null}
      {!query.isLoading && invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Invoices appear here after each payment.</p>
      ) : null}
      {invoices.length ? (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1">Number</th>
              <th>Date</th>
              <th>Period</th>
              <th className="text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-t">
                <td className="py-1.5">
                  {invoice.number}{" "}
                  {invoice.status !== "paid" ? (
                    <Badge variant="secondary">
                      {STATUS_LABEL[invoice.status] ?? invoice.status}
                    </Badge>
                  ) : null}
                </td>
                <td>{day(invoice.issuedAt)}</td>
                <td>
                  {invoice.periodStart
                    ? `${day(invoice.periodStart)} – ${day(invoice.periodEnd)}`
                    : ""}
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
      {creditNotes.length ? (
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
    if (!account.data) return;
    setScheme((account.data.taxIdScheme as TaxScheme | null) ?? "GSTIN");
    setTaxId(account.data.taxId ?? "");
  }, [account.data]);
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
      <Button type="submit" size="sm" variant="outline" disabled={mutation.isPending}>
        Save
      </Button>
    </form>
  );
}
