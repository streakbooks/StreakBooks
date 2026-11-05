import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LookupSelect } from "@/components/lookup";
import { MultiLookupSelect } from "@/components/lookup/MultiLookupSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMinorAmount, parseAmountToMinor } from "@/lib/billing/domain/money";
import {
  createSeries,
  decideRefund,
  decideTaxRule,
  draftTaxRule,
  executeRefund,
  getFinanceOverview,
  issuePendingInvoices,
  requestRefund,
  saveSeller,
  setSellerStatus,
  type FinanceOverview,
} from "@/lib/billing/finance-admin.functions";
import { ISO_COUNTRIES } from "@/lib/billing/reference/iso-reference-data";

const queryKey = ["platform-finance"] as const;
const COUNTRY_OPTIONS = ISO_COUNTRIES.map((item) => ({
  id: item.code,
  label: item.name,
  code: item.code,
}));

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function money(minor: number, currency: string): string {
  return formatMinorAmount(BigInt(minor), currency);
}

function useAction<T>(fn: (input: T) => Promise<unknown>, success: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorText(error, "The change could not be saved.")),
  });
}

export function FinanceAdmin({ canEdit, isOwner }: { canEdit: boolean; isOwner: boolean }) {
  const load = useServerFn(getFinanceOverview);
  const query = useQuery({ queryKey, queryFn: () => load(), retry: false });
  const [reason, setReason] = useState("");
  return (
    <section className="space-y-8" aria-labelledby="finance-heading">
      <header className="space-y-1">
        <h2 id="finance-heading" className="text-xl font-semibold">
          Invoicing, tax and refunds
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tax rules record what an adviser has confirmed; LinkBooks does not decide tax treatment. A
          rule, a seller and each refund need a second platform owner. Issued invoices and credit
          notes cannot change.
        </p>
        {canEdit ? (
          <label className="block max-w-md text-sm">
            Reason for the next change
            <Input
              className="mt-1"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        ) : null}
      </header>
      {query.isLoading ? <p className="text-sm">Loading finance settings…</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">
          {errorText(query.error, "Finance settings could not be loaded.")}
        </p>
      ) : null}
      {query.data ? (
        <>
          <Sellers data={query.data} canEdit={canEdit} isOwner={isOwner} reason={reason} />
          <Series data={query.data} canEdit={canEdit} reason={reason} />
          <TaxRules data={query.data} canEdit={canEdit} isOwner={isOwner} reason={reason} />
          <Payments data={query.data} canEdit={canEdit} reason={reason} />
          <Refunds data={query.data} canEdit={canEdit} isOwner={isOwner} reason={reason} />
        </>
      ) : null}
    </section>
  );
}

type Props = { data: FinanceOverview; canEdit: boolean; isOwner?: boolean; reason: string };

function Sellers({ data, canEdit, isOwner, reason }: Props) {
  const save = useServerFn(saveSeller);
  const status = useServerFn(setSellerStatus);
  const [form, setForm] = useState({
    legalName: "",
    tradingName: "",
    country: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    supportEmail: "",
    scheme: "",
    number: "",
    isDefault: false,
  });
  const [serves, setServes] = useState<string[]>([]);
  const update = (field: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [field]: value }));
  const create = useAction(
    () =>
      save({
        data: {
          id: null,
          legalName: form.legalName,
          tradingName: form.tradingName,
          country: form.country,
          line1: form.line1,
          line2: form.line2,
          city: form.city,
          region: form.region,
          postalCode: form.postalCode,
          supportEmail: form.supportEmail,
          servesCountries: serves,
          isDefault: form.isDefault,
          taxRegistrations:
            form.scheme && form.number
              ? [{ scheme: form.scheme.toUpperCase(), number: form.number }]
              : [],
          reason,
        },
      }),
    "Seller saved as a draft. Another platform owner activates it.",
  );
  const changeStatus = useAction(
    (input: { id: string; status: "active" | "retired" }) => status({ data: { ...input, reason } }),
    "Seller status updated.",
  );
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Seller entities</h3>
      <ul className="space-y-2 text-sm">
        {data.sellers.map((seller) => (
          <li key={seller.id} className="flex flex-wrap items-center gap-2">
            <Badge variant={seller.status === "active" ? "success" : "secondary"}>
              {seller.status}
            </Badge>
            <span>
              {seller.legal_name} · {seller.country_code}
              {seller.is_default ? " · default" : ""}
              {seller.serves_countries.length
                ? ` · serves ${seller.serves_countries.join(", ")}`
                : ""}
              {seller.tax_registrations.length
                ? ` · ${seller.tax_registrations.map((reg) => `${reg.scheme} ${reg.number}`).join(", ")}`
                : ""}
            </span>
            {canEdit && isOwner && seller.status === "draft" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={changeStatus.isPending || seller.created_by === data.me}
                title={
                  seller.created_by === data.me
                    ? "Another platform owner activates a seller you created"
                    : undefined
                }
                onClick={() => changeStatus.mutate({ id: seller.id, status: "active" })}
              >
                Activate
              </Button>
            ) : null}
            {canEdit && isOwner && seller.status === "active" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={changeStatus.isPending}
                onClick={() => changeStatus.mutate({ id: seller.id, status: "retired" })}
              >
                Retire
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(undefined);
          }}
        >
          <label className="text-sm">
            Legal name
            <Input
              className="mt-1"
              value={form.legalName}
              onChange={(e) => update("legalName", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Trading name
            <Input
              className="mt-1"
              value={form.tradingName}
              onChange={(e) => update("tradingName", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Country
            <LookupSelect
              options={COUNTRY_OPTIONS}
              value={form.country}
              onChange={(id) => update("country", id)}
              ariaLabel="Country"
            />
          </label>
          <label className="text-sm">
            Address line 1
            <Input
              className="mt-1"
              value={form.line1}
              onChange={(e) => update("line1", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Address line 2
            <Input
              className="mt-1"
              value={form.line2}
              onChange={(e) => update("line2", e.target.value)}
            />
          </label>
          <label className="text-sm">
            City
            <Input
              className="mt-1"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
          </label>
          <label className="text-sm">
            State or region
            <Input
              className="mt-1"
              value={form.region}
              onChange={(e) => update("region", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Postal code
            <Input
              className="mt-1"
              value={form.postalCode}
              onChange={(e) => update("postalCode", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Support e-mail
            <Input
              className="mt-1"
              value={form.supportEmail}
              onChange={(e) => update("supportEmail", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Tax registration scheme
            <Input
              className="mt-1"
              placeholder="GSTIN, VAT…"
              value={form.scheme}
              onChange={(e) => update("scheme", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Registration number
            <Input
              className="mt-1"
              value={form.number}
              onChange={(e) => update("number", e.target.value)}
            />
          </label>
          <div className="text-sm">
            Countries served
            <MultiLookupSelect
              options={COUNTRY_OPTIONS}
              values={serves}
              onValuesChange={setServes}
              ariaLabel="Countries served"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => update("isDefault", e.target.checked)}
            />
            Default seller for all other countries
          </label>
          <Button type="submit" className="self-end sm:w-fit" disabled={create.isPending}>
            Save seller
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function Series({ data, canEdit, reason }: Props) {
  const create = useServerFn(createSeries);
  const [sellerId, setSellerId] = useState("");
  const [documentType, setDocumentType] = useState<"invoice" | "credit_note">("invoice");
  const [prefix, setPrefix] = useState("");
  const [padding, setPadding] = useState("6");
  const action = useAction(
    () => create({ data: { sellerId, documentType, prefix, padding: Number(padding), reason } }),
    "Numbering series created.",
  );
  const sellerName = (id: string) =>
    data.sellers.find((seller) => seller.id === id)?.legal_name ?? id;
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Numbering</h3>
      <ul className="space-y-1 text-sm">
        {data.series.map((series) => (
          <li key={series.id}>
            {sellerName(series.sellerId)} ·{" "}
            {series.documentType === "invoice" ? "Invoices" : "Credit notes"} · {series.prefix}
            {String(series.nextNumber).padStart(series.padding, "0")} next
            {series.active ? "" : " · closed"}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            action.mutate(undefined);
          }}
        >
          <label className="text-sm">
            Seller
            <LookupSelect
              options={data.sellers
                .filter((s) => s.status !== "retired")
                .map((s) => ({ id: s.id, label: s.legal_name }))}
              value={sellerId}
              onChange={setSellerId}
              ariaLabel="Seller"
            />
          </label>
          <label className="text-sm">
            Document
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={documentType}
              onChange={(e) =>
                setDocumentType(e.target.value === "credit_note" ? "credit_note" : "invoice")
              }
            >
              <option value="invoice">Invoices</option>
              <option value="credit_note">Credit notes</option>
            </select>
          </label>
          <label className="text-sm">
            Prefix
            <Input
              className="mt-1"
              placeholder="LB/IN/"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Digits
            <Input
              className="mt-1"
              inputMode="numeric"
              value={padding}
              onChange={(e) => setPadding(e.target.value)}
            />
          </label>
          <Button type="submit" className="sm:w-fit" disabled={action.isPending || !sellerId}>
            Create series
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function TaxRules({ data, canEdit, isOwner, reason }: Props) {
  const draft = useServerFn(draftTaxRule);
  const decide = useServerFn(decideTaxRule);
  const [form, setForm] = useState({
    country: "",
    region: "",
    customerType: "ANY" as "ANY" | "B2B" | "B2C",
    label: "",
    rate: "",
    priceMode: "inclusive" as "inclusive" | "exclusive",
    treatment: "standard" as
      "standard" | "zero_rated" | "exempt" | "reverse_charge" | "not_collected",
    invoiceNote: "",
    basis: "",
    effectiveFrom: "",
    effectiveTo: "",
  });
  const update = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [field]: value }));
  const create = useAction(
    () =>
      draft({
        data: {
          country: form.country,
          region: form.region,
          customerType: form.customerType,
          label: form.label,
          rateBps: form.treatment === "standard" ? Math.round(Number(form.rate || "0") * 100) : 0,
          priceMode: form.priceMode,
          treatment: form.treatment,
          invoiceNote: form.invoiceNote,
          basis: form.basis,
          effectiveFrom: form.effectiveFrom,
          effectiveTo: form.effectiveTo,
          reason,
        },
      }),
    "Tax rule drafted. Another platform owner approves it.",
  );
  const act = useAction(
    (input: { id: string; action: "approve" | "retire" }) => decide({ data: { ...input, reason } }),
    "Tax rule updated.",
  );
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Tax rules</h3>
      <ul className="space-y-2 text-sm">
        {data.taxRules.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-center gap-2">
            <Badge variant={rule.status === "approved" ? "success" : "secondary"}>
              {rule.status}
            </Badge>
            <span>
              {rule.country_code}
              {rule.region_code ? `-${rule.region_code}` : ""} · {rule.customer_type} ·{" "}
              {rule.tax_label}{" "}
              {rule.treatment === "standard"
                ? `${(rule.rate_bps / 100).toFixed(2)}% ${rule.price_mode}`
                : rule.treatment.replace("_", " ")}{" "}
              · from {rule.effective_from}
              {rule.effective_to ? ` to ${rule.effective_to}` : ""} · basis: {rule.basis}
            </span>
            {canEdit && isOwner && rule.status === "draft" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={act.isPending || rule.created_by === data.me}
                title={
                  rule.created_by === data.me
                    ? "Another platform owner approves a rule you drafted"
                    : undefined
                }
                onClick={() => act.mutate({ id: rule.id, action: "approve" })}
              >
                Approve
              </Button>
            ) : null}
            {canEdit && rule.status !== "retired" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={act.isPending}
                onClick={() => act.mutate({ id: rule.id, action: "retire" })}
              >
                Retire
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(undefined);
          }}
        >
          <label className="text-sm">
            Country
            <LookupSelect
              options={COUNTRY_OPTIONS}
              value={form.country}
              onChange={(id) => update("country", id)}
              ariaLabel="Country"
            />
          </label>
          <label className="text-sm">
            Region code (optional)
            <Input
              className="mt-1"
              value={form.region}
              onChange={(e) => update("region", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Customers
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={form.customerType}
              onChange={(e) => update("customerType", e.target.value as "ANY" | "B2B" | "B2C")}
            >
              <option value="ANY">All customers</option>
              <option value="B2B">Businesses with a tax ID</option>
              <option value="B2C">Customers without a tax ID</option>
            </select>
          </label>
          <label className="text-sm">
            Treatment
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={form.treatment}
              onChange={(e) => update("treatment", e.target.value as typeof form.treatment)}
            >
              <option value="standard">Tax charged</option>
              <option value="zero_rated">Zero-rated</option>
              <option value="exempt">Exempt</option>
              <option value="reverse_charge">Reverse charge</option>
              <option value="not_collected">Not collected</option>
            </select>
          </label>
          <label className="text-sm">
            Tax label
            <Input
              className="mt-1"
              placeholder="GST, VAT…"
              value={form.label}
              onChange={(e) => update("label", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Rate (%)
            <Input
              className="mt-1"
              inputMode="decimal"
              disabled={form.treatment !== "standard"}
              value={form.rate}
              onChange={(e) => update("rate", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Prices
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={form.priceMode}
              onChange={(e) =>
                update("priceMode", e.target.value === "exclusive" ? "exclusive" : "inclusive")
              }
            >
              <option value="inclusive">Include tax</option>
              <option value="exclusive">Exclude tax (added at checkout)</option>
            </select>
          </label>
          <label className="text-sm">
            Effective from
            <Input
              className="mt-1"
              type="date"
              value={form.effectiveFrom}
              onChange={(e) => update("effectiveFrom", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Effective until (optional)
            <Input
              className="mt-1"
              type="date"
              value={form.effectiveTo}
              onChange={(e) => update("effectiveTo", e.target.value)}
            />
          </label>
          <label className="text-sm sm:col-span-3">
            Basis (adviser, reference or decision)
            <Input
              className="mt-1"
              value={form.basis}
              onChange={(e) => update("basis", e.target.value)}
            />
          </label>
          <label className="text-sm sm:col-span-4">
            Invoice note (printed on invoices; written by your adviser)
            <Textarea
              value={form.invoiceNote}
              onChange={(e) => update("invoiceNote", e.target.value)}
            />
          </label>
          <Button type="submit" className="sm:w-fit" disabled={create.isPending}>
            Draft rule
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function Payments({ data, canEdit, reason }: Props) {
  const issue = useServerFn(issuePendingInvoices);
  const request = useServerFn(requestRefund);
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const issueAction = useAction(() => issue({ data: { reason } }), "Pending invoices processed.");
  const refundAction = useAction(
    (input: { paymentId: string; currency: string }) =>
      request({
        data: {
          paymentId: input.paymentId,
          amountMinor: Number(parseAmountToMinor(amount.trim(), input.currency)),
          reason,
        },
      }),
    "Refund requested. Another platform owner approves it.",
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium">Payments</h3>
        {data.pendingInvoices > 0 ? (
          <Badge variant="warning">{data.pendingInvoices} without an invoice</Badge>
        ) : null}
        {canEdit && data.pendingInvoices > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={issueAction.isPending}
            onClick={() => issueAction.mutate(undefined)}
          >
            Issue pending invoices
          </Button>
        ) : null}
      </div>
      {data.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments yet.</p>
      ) : null}
      <ul className="space-y-2 text-sm">
        {data.payments.map((payment) => (
          <li key={payment.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {new Date(payment.paidAt).toLocaleDateString()} · {payment.provider} ({payment.mode}
                ) · {money(payment.amountMinor, payment.currency)}
                {payment.refundedMinor
                  ? ` · refunded ${money(payment.refundedMinor, payment.currency)}`
                  : ""}{" "}
                ·{" "}
                {payment.invoiceNumber ?? (
                  <span className="text-destructive">
                    {payment.invoiceIssueError ?? "No invoice"}
                  </span>
                )}
              </span>
              {canEdit && payment.invoiceNumber && payment.status !== "refunded" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setRefundFor(refundFor === payment.id ? null : payment.id)}
                >
                  Refund…
                </Button>
              ) : null}
            </div>
            {refundFor === payment.id ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  refundAction.mutate({ paymentId: payment.id, currency: payment.currency });
                }}
              >
                <label className="text-sm">
                  Amount ({payment.currency})
                  <Input
                    className="mt-1 w-32"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <Button type="submit" size="sm" disabled={refundAction.isPending || !amount.trim()}>
                  Request refund
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Refunds({ data, canEdit, isOwner, reason }: Props) {
  const decide = useServerFn(decideRefund);
  const execute = useServerFn(executeRefund);
  const decision = useAction(
    (input: { id: string; approve: boolean }) => decide({ data: { ...input, reason } }),
    "Refund decision recorded.",
  );
  const send = useAction(
    (id: string) => execute({ data: { id } }),
    "Refund sent to the payment provider.",
  );
  if (data.refunds.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Refunds</h3>
      <ul className="space-y-2 text-sm">
        {data.refunds.map((refund) => (
          <li key={refund.id} className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                refund.status === "succeeded"
                  ? "success"
                  : refund.status === "failed"
                    ? "warning"
                    : "secondary"
              }
            >
              {refund.status}
            </Badge>
            <span>
              {money(refund.amountMinor, refund.currency)} · {refund.reason}
              {refund.failure ? ` · ${refund.failure}` : ""}
            </span>
            {canEdit && isOwner && refund.status === "requested" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={decision.isPending || refund.requestedBy === data.me}
                  title={
                    refund.requestedBy === data.me
                      ? "Another platform owner approves a refund you requested"
                      : undefined
                  }
                  onClick={() => decision.mutate({ id: refund.id, approve: true })}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={decision.isPending || refund.requestedBy === data.me}
                  onClick={() => decision.mutate({ id: refund.id, approve: false })}
                >
                  Reject
                </Button>
              </>
            ) : null}
            {canEdit && refund.status === "approved" ? (
              <Button
                type="button"
                size="sm"
                disabled={send.isPending}
                onClick={() => send.mutate(refund.id)}
              >
                Send to provider
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
