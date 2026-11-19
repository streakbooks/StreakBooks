import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { toMinorUnits } from "@/lib/accounting/money";
import { formatMoney } from "@/lib/format/format";
import {
  acknowledgePurchaseOrder,
  getSupplierWorkspace,
  requestBankChange,
  submitSupplierDocument,
} from "@/lib/portals/portals.functions";
import { portalOpenPurchaseOrderDiscussion } from "@/lib/messaging/messaging.functions";
import { usePortal } from "@/components/portals/use-portal";

type Row = Record<string, unknown>;

export function PortalBills() {
  const portal = usePortal();
  const current = portal.current;
  const qc = useQueryClient();
  const fetchWorkspace = useServerFn(getSupplierWorkspace);
  const submit = useServerFn(submitSupplierDocument);
  const query = useQuery({
    queryKey: ["portal-supplier", current?.membership_id],
    enabled: Boolean(current?.role === "supplier"),
    queryFn: () =>
      fetchWorkspace({ data: { membershipId: current!.membership_id } }) as Promise<Row>,
  });
  const [kind, setKind] = useState<"bill" | "credit_note">("bill");
  const [reference, setReference] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState(current?.currency ?? "GBP");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [taxBps, setTaxBps] = useState("0");
  const [orderId, setOrderId] = useState("");
  const [memo, setMemo] = useState("");
  const send = useMutation({
    mutationFn: () =>
      submit({
        data: {
          membershipId: current!.membership_id,
          kind,
          supplierReference: reference,
          documentDate,
          dueDate,
          currencyCode: currency,
          ...(orderId ? { purchaseOrderId: orderId } : {}),
          memo,
          lines: [
            {
              description,
              quantity: Number(quantity),
              unitPriceMinor: Number(toMinorUnits(price, currency)),
              taxRateBps: Number(taxBps),
            },
          ],
        },
      }),
    onSuccess: async () => {
      toast.success("Submitted for review. It is not on the organisation's ledger yet.");
      setReference("");
      setDescription("");
      setPrice("");
      await qc.invalidateQueries({ queryKey: ["portal-supplier", current?.membership_id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (!current) return <LoadingState />;
  if (current.role !== "supplier")
    return (
      <p className="text-sm text-muted-foreground">Switch to a supplier login to submit bills.</p>
    );
  const orders = (query.data?.["orders"] as Row[] | undefined) ?? [];
  const submissions = (query.data?.["submissions"] as Row[] | undefined) ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submit a bill or credit note</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate();
            }}
          >
            <label className="block text-sm">
              Type
              <select
                className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2"
                value={kind}
                onChange={(event) => setKind(event.target.value as "bill" | "credit_note")}
              >
                <option value="bill">Bill</option>
                <option value="credit_note">Credit note</option>
              </select>
            </label>
            <Field label="Your reference" value={reference} onChange={setReference} />
            <Field label="Date" type="date" value={documentDate} onChange={setDocumentDate} />
            {kind === "bill" ? (
              <Field label="Due date" type="date" value={dueDate} onChange={setDueDate} />
            ) : null}
            <Field
              label="Currency"
              value={currency}
              onChange={(value) => setCurrency(value.toUpperCase())}
            />
            <Field label="Description" value={description} onChange={setDescription} />
            <Field label="Quantity" value={quantity} onChange={setQuantity} />
            <Field label="Unit price" value={price} onChange={setPrice} />
            <Field label="Tax basis points (2000 = 20%)" value={taxBps} onChange={setTaxBps} />
            <label className="block text-sm">
              Purchase order
              <RecordLookupSelect
                className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2"
                value={orderId}
                onValueChange={(event) => setOrderId(event)}
              >
                <option value="">None</option>
                {orders.map((order) => (
                  <option key={String(order["id"])} value={String(order["id"])}>
                    {String(order["order_number"] ?? "Order")}
                  </option>
                ))}
              </RecordLookupSelect>
            </label>
            <div>
              <Label htmlFor="bill-memo">Note</Label>
              <Textarea
                id="bill-memo"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={send.isPending}>
              Submit for approval
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {query.isError ? <QueryErrorState queries={[query]} /> : null}
        <h2 className="font-semibold">Your submissions</h2>
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {submissions.map((row) => (
            <li key={String(row["id"])} className="px-3 py-3">
              <p className="font-medium">
                {String(row["supplier_reference"])} · {String(row["status"])}
              </p>
              <p className="text-muted-foreground">
                {formatMoney(
                  Number(row["total_minor"] ?? 0),
                  String(row["currency_code"] ?? current.currency),
                  current.locale,
                )}
              </p>
              {row["rejection_reason"] ? <p>{String(row["rejection_reason"])}</p> : null}
            </li>
          ))}
          {!query.isError && submissions.length === 0 ? (
            <li className="px-3 py-6 text-muted-foreground">No submissions yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

export function PortalOrders() {
  const portal = usePortal();
  const current = portal.current;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchWorkspace = useServerFn(getSupplierWorkspace);
  const acknowledge = useServerFn(acknowledgePurchaseOrder);
  const openDiscuss = useServerFn(portalOpenPurchaseOrderDiscussion);
  const query = useQuery({
    queryKey: ["portal-supplier", current?.membership_id],
    enabled: Boolean(current?.role === "supplier"),
    queryFn: () =>
      fetchWorkspace({ data: { membershipId: current!.membership_id } }) as Promise<Row>,
  });
  const ack = useMutation({
    mutationFn: (orderId: string) =>
      acknowledge({
        data: { membershipId: current!.membership_id, orderId, note: "Acknowledged" },
      }),
    onSuccess: async () => {
      toast.success("Order acknowledged");
      await qc.invalidateQueries({ queryKey: ["portal-supplier", current?.membership_id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const discuss = useMutation({
    mutationFn: (orderId: string) =>
      openDiscuss({
        data: { membershipId: current!.membership_id, orderId },
      }),
    onSuccess: (result) => {
      void navigate({
        to: "/portal/app/messages",
        search: { conversation: result.conversationId },
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (!current || current.role !== "supplier") return <LoadingState />;
  const orders = (query.data?.["orders"] as Row[] | undefined) ?? [];
  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={String(order["id"])} className="rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {String(order["order_number"] ?? "Purchase order")} · {String(order["status"])}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={discuss.isPending}
                onClick={() => discuss.mutate(String(order["id"]))}
              >
                Message Purchasing
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(order["supplier_acknowledged_at"]) || ack.isPending}
                onClick={() => ack.mutate(String(order["id"]))}
              >
                {order["supplier_acknowledged_at"] ? "Acknowledged" : "Acknowledge"}
              </Button>
            </div>
          </div>
          <p>
            {formatMoney(
              Number(order["total_minor"] ?? 0),
              String(order["currency_code"] ?? current.currency),
              current.locale,
            )}
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </li>
      ))}
      {query.isError ? (
        <li>
          <QueryErrorState queries={[query]} title="Could not load purchase orders" />
        </li>
      ) : null}
      {orders.length === 0 && !query.isPending && !query.isError ? (
        <li className="text-sm text-muted-foreground">No purchase orders have been sent.</li>
      ) : null}
    </ul>
  );
}

export function PortalRemittances() {
  const portal = usePortal();
  const current = portal.current;
  const fetchWorkspace = useServerFn(getSupplierWorkspace);
  const query = useQuery({
    queryKey: ["portal-supplier", current?.membership_id],
    enabled: Boolean(current?.role === "supplier"),
    queryFn: () =>
      fetchWorkspace({ data: { membershipId: current!.membership_id } }) as Promise<Row>,
  });
  if (!current) return <LoadingState />;
  if (query.isError) {
    return <QueryErrorState queries={[query]} title="Could not load remittances" />;
  }
  const rows = (query.data?.["remittances"] as Row[] | undefined) ?? [];
  const bills = (query.data?.["bills"] as Row[] | undefined) ?? [];
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold">Payments from the organisation</h2>
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {rows.map((row) => (
            <li key={String(row["id"])} className="px-3 py-3">
              <p>
                {String(row["payment_date"])} ·{" "}
                {formatMoney(
                  Number(row["amount_minor"] ?? 0),
                  String(row["currency_code"] ?? current.currency),
                  current.locale,
                )}
              </p>
              <p className="text-muted-foreground">{String(row["reference"] ?? "Remittance")}</p>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-3 py-6 text-muted-foreground">No posted payments yet.</li>
          ) : null}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Bills on the organisation's books</h2>
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {bills.map((bill) => (
            <li key={String(bill["id"])} className="flex justify-between px-3 py-3">
              <span>
                {String(bill["supplier_invoice_number"] ?? bill["bill_number"] ?? "Bill")} ·{" "}
                {String(bill["status"])}
              </span>
              <span>
                {formatMoney(
                  Number(bill["total_minor"] ?? 0),
                  String(bill["currency_code"] ?? current.currency),
                  current.locale,
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function PortalBank() {
  const portal = usePortal();
  const current = portal.current;
  const qc = useQueryClient();
  const fetchWorkspace = useServerFn(getSupplierWorkspace);
  const request = useServerFn(requestBankChange);
  const query = useQuery({
    queryKey: ["portal-supplier", current?.membership_id],
    enabled: Boolean(current?.role === "supplier"),
    queryFn: () =>
      fetchWorkspace({ data: { membershipId: current!.membership_id } }) as Promise<Row>,
  });
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingCode, setRoutingCode] = useState("");
  const [countryCode, setCountryCode] = useState("GB");
  const send = useMutation({
    mutationFn: () =>
      request({
        data: {
          membershipId: current!.membership_id,
          accountName,
          bankName,
          accountNumber,
          routingCode,
          countryCode,
        },
      }),
    onSuccess: async () => {
      toast.success(
        "Sent for verification. Payments are not redirected until the organisation accepts them.",
      );
      await qc.invalidateQueries({ queryKey: ["portal-supplier", current?.membership_id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (!current) return <LoadingState />;
  if (query.isError) {
    return <QueryErrorState queries={[query]} title="Could not load bank details" />;
  }
  const bank = (query.data?.["bank"] as Row | undefined) ?? {};
  const verified = bank["verified"] as Row | null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details on file</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {verified ? (
            <p>
              {String(verified["bank_name"])} · {String(verified["masked"])}
            </p>
          ) : (
            <p className="text-muted-foreground">No verified bank details yet.</p>
          )}
          {bank["pending"] ? (
            <p className="mt-2">A change is waiting for the organisation to verify it.</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request a change</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate();
            }}
          >
            <Field label="Account name" value={accountName} onChange={setAccountName} />
            <Field label="Bank" value={bankName} onChange={setBankName} />
            <Field label="Account number" value={accountNumber} onChange={setAccountNumber} />
            <Field label="Routing code" value={routingCode} onChange={setRoutingCode} />
            <Field
              label="Country"
              value={countryCode}
              onChange={(value) => setCountryCode(value.toUpperCase())}
            />
            <Button type="submit" disabled={send.isPending}>
              Submit for verification
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
