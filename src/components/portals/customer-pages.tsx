import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { toMinorUnits } from "@/lib/accounting/money";
import { formatDate, formatMoney } from "@/lib/format/format";
import type { PrintDocument } from "@/lib/documents/types";
import {
  downloadPortalFile,
  getPortalHome,
  getPortalInvoice,
  getPortalStatement,
  listPortalCredits,
  listPortalFiles,
  listPortalInvoices,
  listPortalMessages,
  listPortalNotifications,
  listPortalReceipts,
  postPortalMessage,
  startPortalPayment,
  uploadPortalFile,
} from "@/lib/portals/portals.functions";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/components/portals/use-portal";

type Row = Record<string, unknown>;

function money(minor: unknown, currency: unknown, locale?: string | null) {
  return formatMoney(Number(minor ?? 0), String(currency ?? "GBP"), locale);
}

function dateOf(value: unknown, locale?: string | null, dateFormat?: string | null) {
  const text = String(value ?? "");
  return formatDate(text.slice(0, 10), locale, dateFormat);
}

export function PortalHome() {
  const portal = usePortal();
  const current = portal.current;
  const fetchHome = useServerFn(getPortalHome);
  const query = useQuery({
    queryKey: ["portal-home", current?.membership_id],
    enabled: Boolean(current?.membership_id && current.enabled),
    queryFn: () => fetchHome({ data: { membershipId: current!.membership_id } }) as Promise<Row>,
  });
  if (!current) return <LoadingState />;
  if (!current.enabled) return null;
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState description={friendlyAuthError(query.error)} onRetry={() => query.refetch()} />
    );
  const home = query.data;
  if (home["role"] === "supplier") {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Open orders" value={String(home["open_orders"] ?? 0)} />
        <Metric label="Waiting for review" value={String(home["submitted"] ?? 0)} />
        <Metric label="Unread notices" value={String(home["unread_notifications"] ?? 0)} />
      </div>
    );
  }
  const balances = (home["balances"] as Row[] | undefined) ?? [];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {balances.length ? (
          balances.map((balance) => (
            <Metric
              key={String(balance["currency"])}
              label={`Outstanding ${String(balance["currency"])}`}
              value={money(balance["outstanding_minor"], balance["currency"], current.locale)}
              hint={`${String(balance["overdue_count"] ?? 0)} overdue · ${money(balance["overdue_minor"], balance["currency"], current.locale)}`}
            />
          ))
        ) : (
          <Metric label="Outstanding" value={money(0, current.currency, current.locale)} />
        )}
        <Metric label="Unread notices" value={String(home["unread_notifications"] ?? 0)} />
      </div>
      <DocumentTable
        title="Recent invoices"
        rows={(home["recent_invoices"] as Row[] | undefined) ?? []}
        locale={current.locale}
        dateFormat={current.date_format}
      />
    </div>
  );
}

export function PortalInvoices() {
  const portal = usePortal();
  const current = portal.current;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const fetchRows = useServerFn(listPortalInvoices);
  const query = useQuery({
    queryKey: ["portal-invoices", current?.membership_id, q, status],
    enabled: Boolean(current?.membership_id),
    queryFn: () =>
      fetchRows({
        data: { membershipId: current!.membership_id, q, status, page: 1 },
      }) as Promise<Row>,
  });
  if (!current) return <LoadingState />;
  const rows = (query.data?.["rows"] as Row[] | undefined) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search invoice number"
          aria-label="Search invoices"
          className="max-w-xs"
        />
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Invoice status"
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
      </div>
      {query.isPending ? <LoadingState /> : null}
      {query.isError ? (
        <ErrorState description={friendlyAuthError(query.error)} onRetry={() => query.refetch()} />
      ) : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((row) => (
          <li
            key={String(row["id"])}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
          >
            <div>
              <Link
                className="font-medium underline"
                to="/portal/app/invoices/$invoiceId"
                params={{ invoiceId: String(row["id"]) }}
              >
                {String(row["invoice_number"] ?? "Invoice")}
              </Link>
              <p className="text-sm text-muted-foreground">
                {dateOf(row["invoice_date"], current.locale, current.date_format)} · due{" "}
                {dateOf(row["due_date"], current.locale, current.date_format)}
              </p>
            </div>
            <div className="text-right">
              <Badge variant="outline">{String(row["status"])}</Badge>
              <p className="text-sm">
                {money(row["due_minor"], row["currency_code"], current.locale)} due
              </p>
            </div>
          </li>
        ))}
        {!query.isPending && rows.length === 0 ? (
          <li className="px-3 py-6 text-sm text-muted-foreground">No invoices match.</li>
        ) : null}
      </ul>
    </div>
  );
}

export function PortalInvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const portal = usePortal();
  const current = portal.current;
  const fetchInvoice = useServerFn(getPortalInvoice);
  const pay = useServerFn(startPortalPayment);
  const [amount, setAmount] = useState("");
  const query = useQuery({
    queryKey: ["portal-invoice", current?.membership_id, invoiceId],
    enabled: Boolean(current?.membership_id),
    queryFn: () =>
      fetchInvoice({ data: { membershipId: current!.membership_id, invoiceId } }) as Promise<Row>,
  });
  const payment = useMutation({
    mutationFn: () => {
      const invoice = (query.data?.["invoice"] as Row) ?? {};
      const currency = String(invoice["currency_code"] ?? current?.currency ?? "GBP");
      const minor = Number(toMinorUnits(amount, currency));
      return pay({
        data: {
          membershipId: current!.membership_id,
          invoiceId,
          amountMinor: minor,
          idempotencyKey: crypto.randomUUID(),
        },
      });
    },
    onSuccess: (result) => {
      const outcome = result as { mode?: string; url?: string | null; livemode?: boolean };
      if (outcome.mode === "instructions" || !outcome.url) {
        toast.message("Online checkout is not configured. Use the payment details on the invoice.");
        return;
      }
      if (outcome.livemode === false && outcome.mode === "stripe") {
        toast.message("Opening the test checkout. No live card is charged.");
      }
      window.location.assign(outcome.url);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (!current) return <LoadingState />;
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState description={friendlyAuthError(query.error)} onRetry={() => query.refetch()} />
    );
  const data = query.data;
  const invoice = (data["invoice"] as Row) ?? {};
  const branding = (data["branding"] as Row | null) ?? {};
  const lines = (data["lines"] as Row[]) ?? [];
  const printable = toPrintDocument(invoice, lines, current.contact_name, branding);
  const payable = Number(data["payable_minor"] ?? 0);
  const checkoutMode = String(data["checkout_mode"] ?? "instructions");
  const canCheckout =
    Boolean(data["settlement_ready"]) && ["stripe", "razorpay", "sandbox"].includes(checkoutMode);
  const sandbox = checkoutMode === "sandbox";
  let amountError = "";
  if (amount.trim()) {
    try {
      const minor = Number(
        toMinorUnits(amount, String(invoice["currency_code"] ?? current.currency ?? "GBP")),
      );
      if (minor <= 0) amountError = "Enter an amount greater than zero.";
      else if (minor > payable) amountError = "The amount exceeds the available invoice balance.";
    } catch {
      amountError = "Enter a valid payment amount.";
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="outline" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
        <Button variant="outline" asChild>
          <Link to="/portal/app/invoices">All invoices</Link>
        </Button>
      </div>
      {payable > 0 ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base">
              {canCheckout
                ? sandbox
                  ? "Sandbox payment"
                  : data["checkout_live"]
                    ? "Pay this invoice"
                    : "Test checkout"
                : "Pay by bank transfer"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {canCheckout
                ? `Up to ${money(payable, invoice["currency_code"], current.locale)} is available to pay, after payments already in progress.`
                : "Online checkout is unavailable. Use the bank details and payment reference on this invoice, or contact the organisation for instructions."}
            </p>
            {canCheckout ? (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor="pay-amount">Amount</Label>
                  <Input
                    id="pay-amount"
                    inputMode="decimal"
                    aria-invalid={Boolean(amountError)}
                    aria-describedby={amountError ? "pay-amount-error" : undefined}
                    disabled={payment.isPending}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>
                <Button
                  disabled={payment.isPending || !amount.trim() || Boolean(amountError)}
                  aria-busy={payment.isPending}
                  onClick={() => payment.mutate()}
                >
                  {payment.isPending
                    ? "Opening checkout…"
                    : sandbox
                      ? "Review sandbox payment"
                      : data["checkout_live"]
                        ? "Continue to payment"
                        : "Open test checkout"}
                </Button>
              </div>
            ) : null}
            {amountError && canCheckout ? (
              <p id="pay-amount-error" role="alert" className="text-sm text-destructive">
                {amountError}
              </p>
            ) : null}
            {canCheckout && sandbox ? (
              <p className="text-xs text-muted-foreground">
                No funds are collected. Confirming a sandbox payment posts a real receipt in this
                organisation.
              </p>
            ) : null}
            {canCheckout && !sandbox && !data["checkout_live"] ? (
              <p className="text-sm text-warning-ink">Test mode. No live payment is collected.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <DocumentSheet
        document={printable}
        branding={{
          displayName: String(
            branding["trading_name"] || data["company_name"] || current.company_name,
          ),
          legalName: null,
          addressLines: String(branding["address_text"] ?? "")
            .split("\n")
            .filter(Boolean),
          taxNumber: (branding["tax_number"] as string | null) ?? null,
          email: (branding["invoice_email"] as string | null) ?? null,
          phone: (branding["invoice_phone"] as string | null) ?? null,
          logoUrl: (branding["logo_url"] as string | null) ?? null,
          accentColor: current.theme_color || "#225eae",
          footerText: null,
          bankDetails: (branding["bank_details"] as string | null) ?? null,
          paymentInstructions: (branding["payment_instructions"] as string | null) ?? null,
          defaultNotes: null,
          letterheadLine: (branding["letterhead_line"] as string | null) ?? null,
        }}
        locale={current.locale ?? "en-GB"}
        dateFormat={current.date_format}
      />
    </div>
  );
}

export function PortalCredits() {
  const portal = usePortal();
  const current = portal.current;
  const fetchRows = useServerFn(listPortalCredits);
  const query = useQuery({
    queryKey: ["portal-credits", current?.membership_id],
    enabled: Boolean(current),
    queryFn: () => fetchRows({ data: { membershipId: current!.membership_id } }) as Promise<Row[]>,
  });
  if (!current) return <LoadingState />;
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState description={friendlyAuthError(query.error)} onRetry={() => query.refetch()} />
    );
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {(query.data ?? []).map((row) => (
        <li key={String(row["id"])} className="flex items-center justify-between px-3 py-3 text-sm">
          <span>
            {String(row["credit_number"] ?? "Credit note")} ·{" "}
            {dateOf(row["credit_date"], current.locale, current.date_format)}
          </span>
          <span>
            {money(row["total_minor"], row["currency_code"], current.locale)} ·{" "}
            {String(row["status"])}
          </span>
        </li>
      ))}
      {(query.data ?? []).length === 0 ? (
        <li className="px-3 py-6 text-sm text-muted-foreground">No credit notes.</li>
      ) : null}
    </ul>
  );
}

export function PortalStatement() {
  const portal = usePortal();
  const current = portal.current;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const fetchStatement = useServerFn(getPortalStatement);
  const query = useQuery({
    queryKey: ["portal-statement", current?.membership_id, from, to],
    enabled: Boolean(current),
    queryFn: () =>
      fetchStatement({ data: { membershipId: current!.membership_id, from, to } }) as Promise<
        Row[]
      >,
  });
  if (!current) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="From"
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          aria-label="To"
        />
        <Button variant="outline" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>
      {query.isPending ? <LoadingState /> : null}
      {query.isError ? (
        <ErrorState description={friendlyAuthError(query.error)} onRetry={() => query.refetch()} />
      ) : null}
      {(query.data ?? []).map((section) => (
        <Card key={String(section["currency"])}>
          <CardHeader>
            <CardTitle className="text-base">{String(section["currency"])}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Opening {money(section["opening_minor"], section["currency"], current.locale)}</p>
            <ul className="divide-y divide-border">
              {((section["rows"] as Row[]) ?? []).map((row, index) => (
                <li key={index} className="flex justify-between gap-2 py-2">
                  <span>
                    {dateOf(row["date"], current.locale, current.date_format)} ·{" "}
                    {String(row["kind"])} {String(row["reference"] ?? "")}
                  </span>
                  <span>
                    {Number(row["debit_minor"])
                      ? money(row["debit_minor"], section["currency"], current.locale)
                      : ""}
                    {Number(row["credit_minor"])
                      ? ` − ${money(row["credit_minor"], section["currency"], current.locale)}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="font-medium">
              Closing {money(section["closing_minor"], section["currency"], current.locale)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PortalPayments() {
  const portal = usePortal();
  const current = portal.current;
  const fetchRows = useServerFn(listPortalReceipts);
  const fetchNotices = useServerFn(listPortalNotifications);
  const query = useQuery({
    queryKey: ["portal-receipts", current?.membership_id],
    enabled: Boolean(current),
    queryFn: () => fetchRows({ data: { membershipId: current!.membership_id } }) as Promise<Row[]>,
  });
  const notices = useQuery({
    queryKey: ["portal-notices", current?.membership_id],
    enabled: Boolean(current),
    queryFn: () =>
      fetchNotices({ data: { membershipId: current!.membership_id, markRead: true } }) as Promise<
        Row[]
      >,
  });
  if (!current) return <LoadingState />;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Payments and notices</h2>
      {query.isError ? (
        <ErrorState description={friendlyAuthError(query.error)} onRetry={() => query.refetch()} />
      ) : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {(query.data ?? []).map((row) => (
          <li key={String(row["id"])} className="px-3 py-3 text-sm">
            <div className="flex justify-between gap-2">
              <span>
                {dateOf(row["receipt_date"], current.locale, current.date_format)} ·{" "}
                {String(row["reference"] ?? "Receipt")} · {String(row["status"])}
              </span>
              <span>{money(row["amount_minor"], row["currency_code"], current.locale)}</span>
            </div>
          </li>
        ))}
        {(query.data ?? []).length === 0 && !query.isPending ? (
          <li className="px-3 py-6 text-sm text-muted-foreground">No receipts yet.</li>
        ) : null}
      </ul>
      <ul className="space-y-2">
        {(notices.data ?? []).map((notice) => (
          <li
            key={String(notice["id"])}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            <p className="font-medium">{String(notice["title"])}</p>
            <p className="text-muted-foreground">{String(notice["body"])}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PortalDocuments() {
  const portal = usePortal();
  const current = portal.current;
  const qc = useQueryClient();
  const fetchFiles = useServerFn(listPortalFiles);
  const upload = useServerFn(uploadPortalFile);
  const download = useServerFn(downloadPortalFile);
  const [category, setCategory] = useState("general");
  const query = useQuery({
    queryKey: ["portal-files", current?.membership_id],
    enabled: Boolean(current),
    queryFn: () => fetchFiles({ data: { membershipId: current!.membership_id } }) as Promise<Row[]>,
  });
  const send = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await fileToBase64(file);
      return upload({
        data: {
          membershipId: current!.membership_id,
          fileName: file.name,
          mimeType: file.type,
          category,
          contentBase64,
        },
      });
    },
    onSuccess: async () => {
      toast.success("File uploaded");
      await qc.invalidateQueries({ queryKey: ["portal-files", current?.membership_id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (!current) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Category
          <select
            className="mt-1 block h-9 rounded-md border border-input bg-background px-2"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="general">General</option>
            <option value="tax">Tax and compliance</option>
            <option value="supporting">Supporting document</option>
            <option value="invoice_query">Invoice query</option>
          </select>
        </label>
        <Input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          aria-label="Upload a document"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) send.mutate(file);
          }}
        />
      </div>
      {query.isError ? (
        <ErrorState description={friendlyAuthError(query.error)} onRetry={() => query.refetch()} />
      ) : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {(query.data ?? []).map((file) => (
          <li
            key={String(file["id"])}
            className="flex items-center justify-between px-3 py-3 text-sm"
          >
            <span>
              {String(file["file_name"])} · {String(file["category"])}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void download({
                  data: { membershipId: current.membership_id, fileId: String(file["id"]) },
                })
                  .then((result) => {
                    const fileResult = result as Row;
                    saveBase64(
                      String(fileResult["file_name"]),
                      String(fileResult["mime_type"]),
                      String(fileResult["content_base64"]),
                    );
                  })
                  .catch((error) => toast.error(friendlyAuthError(error)));
              }}
            >
              Download
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PortalMessages() {
  const portal = usePortal();
  const current = portal.current;
  const qc = useQueryClient();
  const fetchMessages = useServerFn(listPortalMessages);
  const sendMessage = useServerFn(postPortalMessage);
  const [body, setBody] = useState("");
  const query = useQuery({
    queryKey: ["portal-messages", current?.membership_id],
    enabled: Boolean(current),
    queryFn: () =>
      fetchMessages({ data: { membershipId: current!.membership_id } }) as Promise<Row[]>,
  });
  const send = useMutation({
    mutationFn: () => sendMessage({ data: { membershipId: current!.membership_id, body } }),
    onSuccess: async () => {
      setBody("");
      await qc.invalidateQueries({ queryKey: ["portal-messages", current?.membership_id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (!current) return <LoadingState />;
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {(query.data ?? []).map((message) => (
          <li
            key={String(message["id"])}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            <p className="text-xs text-muted-foreground">{String(message["author_role"])}</p>
            <p>{String(message["body"])}</p>
          </li>
        ))}
      </ul>
      {query.isError ? (
        <ErrorState description={friendlyAuthError(query.error)} onRetry={() => query.refetch()} />
      ) : null}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          send.mutate();
        }}
      >
        <Label htmlFor="portal-message">Message</Label>
        <Textarea
          id="portal-message"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button type="submit" disabled={send.isPending || !body.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

export function PortalSecurity() {
  const [code, setCode] = useState("");
  const [factor, setFactor] = useState<{ id: string; qr: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Authenticator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Optional until the organisation requires it. This uses your LinkBooks sign-in. Card
          numbers are never stored here.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void supabase.auth.mfa
              .enroll({ factorType: "totp", friendlyName: "LinkBooks portal" })
              .then(({ data, error }) => {
                if (error || !data) {
                  setMessage(error?.message ?? "An authenticator could not be started.");
                  return;
                }
                setFactor({ id: data.id, qr: data.totp.qr_code });
              });
          }}
        >
          Set up authenticator
        </Button>
        {factor ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void supabase.auth.mfa
                .challenge({ factorId: factor.id })
                .then(async ({ data, error }) => {
                  if (error || !data) {
                    setMessage(error?.message ?? "The challenge failed.");
                    return;
                  }
                  const verified = await supabase.auth.mfa.verify({
                    factorId: factor.id,
                    challengeId: data.id,
                    code,
                  });
                  setMessage(
                    verified.error
                      ? verified.error.message
                      : "Authenticator is on. Sign in again if a page asks for the second step.",
                  );
                });
            }}
          >
            <img alt="Authenticator QR code" src={factor.qr} className="h-40 w-40" />
            <Label htmlFor="mfa-code">6-digit code</Label>
            <Input
              id="mfa-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
            />
            <Button type="submit">Confirm</Button>
          </form>
        ) : null}
        {message ? <p>{message}</p> : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function DocumentTable({
  title,
  rows,
  locale,
  dateFormat,
}: {
  title: string;
  rows: Row[];
  locale: string | null;
  dateFormat: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {rows.map((row) => (
            <li key={String(row["id"])} className="flex justify-between py-2">
              <span>
                {String(row["invoice_number"] ?? "Invoice")} ·{" "}
                {dateOf(row["invoice_date"], locale, dateFormat)}
              </span>
              <span>{money(row["due_minor"], row["currency_code"], locale)}</span>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="py-2 text-muted-foreground">Nothing to show yet.</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function toPrintDocument(
  invoice: Row,
  lines: Row[],
  companyName: string,
  branding: Row,
): PrintDocument {
  const status = String(invoice["status"] ?? "");
  return {
    kind: "sales_invoice",
    id: String(invoice["id"] ?? ""),
    title: "Tax invoice",
    number: (invoice["invoice_number"] as string | null) ?? null,
    status,
    mark: status === "paid" ? "PAID" : status === "void" ? "VOID" : null,
    currency: String(invoice["currency_code"] ?? "GBP"),
    fxRateToBase: Number(invoice["fx_rate_to_base"] ?? 1),
    baseCurrency: String(invoice["currency_code"] ?? "GBP"),
    issueDate: String(invoice["invoice_date"] ?? ""),
    dueDate: (invoice["due_date"] as string | null) ?? null,
    expiryDate: null,
    reference: null,
    party: {
      roleLabel: "Bill to",
      name: companyName,
      addressLines: [],
      email: null,
      phone: null,
      taxNumber: null,
    },
    lines: lines.map((line) => ({
      description: String(line["description"] ?? ""),
      quantity: Number(line["quantity"] ?? 0),
      unitPriceMinor: Number(line["unit_price_minor"] ?? 0),
      discountMinor: Number(line["discount_minor"] ?? 0),
      taxRateBps: Number(line["tax_rate_bps"] ?? 0),
      netMinor: Number(line["net_minor"] ?? 0),
      taxMinor: Number(line["tax_minor"] ?? 0),
      grossMinor: Number(line["gross_minor"] ?? 0),
    })),
    showLines: true,
    taxSummary: [],
    totals: {
      subtotalMinor: Number(invoice["subtotal_minor"] ?? 0),
      taxMinor: Number(invoice["tax_minor"] ?? 0),
      totalMinor: Number(invoice["total_minor"] ?? 0),
      paidMinor: Number(invoice["amount_paid_minor"] ?? 0),
      creditedMinor: Number(invoice["amount_credited_minor"] ?? 0),
      dueMinor: Number(invoice["due_minor"] ?? 0),
    },
    allocations: [],
    allocationsTitle: null,
    paymentAmountMinor: null,
    extraMeta: [],
    notes: (invoice["memo"] as string | null) ?? null,
    showPaymentDetails: true,
    paymentTermsText: (branding["payment_instructions"] as string | null) ?? null,
    partyEmail: null,
    partyId: null,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

function saveBase64(name: string, mime: string, content: string) {
  const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
