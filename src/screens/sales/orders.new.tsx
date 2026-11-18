import { salesOrderLinesFromForm } from "@/lib/sales/sales-order-lines";
import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { saveSalesOrder, type SalesOrder } from "@/lib/sales/sales-orders.functions";
import { getSalesDocumentConfig } from "@/lib/sales/sales-config.functions";
import { listCustomers } from "@/lib/sales/sales.functions";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { emptyOrderLine } from "@/lib/purchases/purchase-order";
import { sumLines } from "@/lib/sales/line-helpers";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { ContactLookup } from "@/components/lookup";
import { OrderEntryLines } from "@/components/orders/OrderEntryLines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NewSalesOrder() {
  const { company } = useActiveCompany();
  const navigate = useNavigate();
  if (!company) {
    return (
      <EmptyState title="Select an organisation" description="Choose a company to create orders." />
    );
  }
  return (
    <TransactionWorkspace
      title="New sales order"
      description="Agree the customer order. Saving a draft has no ledger impact until you confirm and invoice."
      breadcrumbs={[
        { label: "Sales", to: "/sales" },
        { label: "Orders", to: "/sales/orders" },
        { label: "New" },
      ]}
    >
      <SalesOrderForm
        companyId={company.id}
        currency={company.base_currency}
        initial={undefined}
        onSaved={(id) => void navigate({ to: "/sales/orders", search: { order: id } })}
        onCancel={() => void navigate({ to: "/sales/orders" })}
      />
    </TransactionWorkspace>
  );
}

export function SalesOrderForm({
  companyId,
  currency: baseCurrency,
  initial,
  onSaved,
  onCancel,
}: {
  companyId: string;
  currency: string;
  initial: SalesOrder | undefined;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const fmt = useFormat();
  const { can } = useCan();
  const fetchCustomers = useServerFn(listCustomers),
    fetchAccounts = useServerFn(listAccounts),
    fetchConfig = useServerFn(getSalesDocumentConfig),
    save = useServerFn(saveSalesOrder);
  const customers = useQuery({
    queryKey: ["customers", companyId],
    queryFn: () => fetchCustomers({ data: { companyId } }),
  });
  const accounts = useQuery({
    queryKey: ["accounts", companyId],
    queryFn: () => fetchAccounts({ data: { companyId } }),
  });
  const config = useQuery({
    queryKey: ["sales-document-config", companyId],
    queryFn: () => fetchConfig({ data: { companyId } }),
  });
  const requestId = useRef(crypto.randomUUID());
  const [contactId, setContactId] = useState(initial?.contact_id ?? "");
  const [date, setDate] = useState(initial?.order_date ?? new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState(initial?.currency_code ?? baseCurrency);
  const [fx, setFx] = useState(String(initial?.fx_rate_to_base ?? 1));
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [lines, setLines] = useState(() =>
    initial
      ? initial.lines.map((l) => ({
          ...emptyOrderLine(),
          description: l.description,
          accountId: l.account_id,
          quantity: String(l.quantity),
          unitPrice: fromMinorUnits(l.unit_price_minor, initial.currency_code),
          discount: fromMinorUnits(l.discount_minor, initial.currency_code),
          taxPercent: String(l.tax_rate_bps / 100),
        }))
      : [emptyOrderLine()],
  );
  const parsed = () =>
    salesOrderLinesFromForm(lines, currency, config.data?.treatment ?? "exclusive");
  let total: string | null = null;
  try {
    total = fmt.money(sumLines(parsed()).total_minor, currency);
  } catch {
    /* Incomplete input is validated on submit. */
  }
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          requestId: requestId.current,
          contactId,
          orderDate: date,
          currencyCode: currency,
          fxRate: currency === baseCurrency ? 1 : Number(fx),
          memo,
          lines: parsed().map(
            ({ description, accountId, quantity, unitPriceMinor, discountMinor, taxRateBps }) => ({
              description,
              accountId,
              quantity,
              unitPriceMinor,
              discountMinor: discountMinor ?? 0,
              taxRateBps: taxRateBps ?? 0,
            }),
          ),
          ...(initial ? { orderId: initial.id, version: initial.version } : {}),
        },
      }),
    onSuccess: (r) => {
      toast.success("Sales order saved");
      onSaved(r.id);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  if (customers.isPending || accounts.isPending || config.isPending) return <LoadingState />;
  if (customers.isError || accounts.isError || config.isError)
    return (
      <ErrorState
        title="Could not load order options"
        description={friendlyAuthError(customers.error ?? accounts.error ?? config.error)}
        onRetry={() => {
          void customers.refetch();
          void accounts.refetch();
          void config.refetch();
        }}
      />
    );
  return (
    <fieldset disabled={mutation.isPending} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Customer</Label>
          <ContactLookup
            ariaLabel="Sales order customer"
            companyId={companyId}
            contacts={customers.data ?? []}
            value={contactId}
            onChange={setContactId}
            allowClear={false}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sales-order-date">Order date</Label>
          <Input
            id="sales-order-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sales-order-currency">Currency</Label>
          <Input
            id="sales-order-currency"
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </div>
        {currency !== baseCurrency ? (
          <div className="space-y-2">
            <Label htmlFor="sales-order-fx">Exchange rate to {baseCurrency}</Label>
            <Input
              id="sales-order-fx"
              inputMode="decimal"
              value={fx}
              onChange={(e) => setFx(e.target.value)}
            />
          </div>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Prices {config.data.treatment === "inclusive" ? "include" : "exclude"} tax, using the
        organisation's current sales tax treatment.
      </p>
      <OrderEntryLines
        lines={lines}
        onChange={setLines}
        accounts={(accounts.data ?? []).filter((a) => a.is_active && a.is_postable)}
        companyId={companyId}
        currency={currency}
      />
      <p className="text-right font-semibold">Total: {total ?? "Complete valid lines"}</p>
      <Label htmlFor="sales-order-memo">Memo</Label>
      <Textarea
        id="sales-order-memo"
        value={memo}
        maxLength={500}
        onChange={(e) => setMemo(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={mutation.isPending || !can("sales.draft") || !contactId || !total}
          onClick={() => mutation.mutate()}
        >
          Save draft
        </Button>
        <Button size="sm" variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </fieldset>
  );
}
