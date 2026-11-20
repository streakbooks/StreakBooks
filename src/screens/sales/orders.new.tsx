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
import { createEmptyDocumentLines } from "@/lib/ui/document-line-defaults";
import { sumLines } from "@/lib/sales/line-helpers";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
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
    <SalesOrderForm
      companyId={company.id}
      currency={company.base_currency}
      initial={undefined}
      title="New sales order"
      onSaved={(id) => void navigate({ to: "/sales/orders", search: { order: id } })}
      onCancel={() => void navigate({ to: "/sales/orders" })}
    />
  );
}

export function SalesOrderForm({
  companyId,
  currency: baseCurrency,
  initial,
  title = initial ? "Edit sales order" : "New sales order",
  onSaved,
  onCancel,
}: {
  companyId: string;
  currency: string;
  initial: SalesOrder | undefined;
  title?: string;
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
      : createEmptyDocumentLines(emptyOrderLine),
  );
  const treatment = config.data?.treatment ?? "exclusive";
  let totals: { subtotal_minor: bigint; tax_minor: bigint; total_minor: bigint } | null = null;
  try {
    totals = sumLines(salesOrderLinesFromForm(lines, currency, treatment));
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
          lines: salesOrderLinesFromForm(lines, currency, treatment).map(
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
  const requiredQueries = [customers, accounts, config];
  if (requiredQueries.some((query) => query.isError))
    return <QueryErrorState queries={requiredQueries} title="Could not load order options" />;
  if (customers.isPending || accounts.isPending || config.isPending) return <LoadingState />;
  return (
    <TransactionWorkspace
      title={title}
      description="Agree the customer order. Saving a draft has no ledger impact until you confirm and invoice."
      breadcrumbs={[
        { label: "Sales", to: "/sales" },
        { label: "Orders", to: "/sales/orders" },
        { label: initial ? "Edit" : "New" },
      ]}
      meta={<StatusBadge status="draft" label={initial ? "Editing draft" : "Draft"} />}
      details={
        <FormGrid columns={4}>
          <FormControlShell width="contact">
            <Label>Customer</Label>
            <ContactLookup
              ariaLabel="Sales order customer"
              companyId={companyId}
              contacts={customers.data ?? []}
              value={contactId}
              onChange={setContactId}
              allowClear={false}
            />
          </FormControlShell>
          <FormControlShell width="date">
            <Label htmlFor="sales-order-date">Order date</Label>
            <Input
              id="sales-order-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell width="currency">
            <Label htmlFor="sales-order-currency">Currency</Label>
            <Input
              id="sales-order-currency"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </FormControlShell>
          {currency !== baseCurrency ? (
            <FormControlShell width="money">
              <Label htmlFor="sales-order-fx">Exchange rate to {baseCurrency}</Label>
              <Input
                id="sales-order-fx"
                inputMode="decimal"
                value={fx}
                onChange={(e) => setFx(e.target.value)}
              />
            </FormControlShell>
          ) : null}
          <FormControlShell className="sm:col-span-2">
            <Label htmlFor="sales-order-memo">Memo</Label>
            <Textarea
              id="sales-order-memo"
              value={memo}
              maxLength={500}
              rows={1}
              className="lb-spreadsheet-wrap min-h-8"
              onChange={(e) => setMemo(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell className="sm:col-span-2">
            <p className="text-sm text-muted-foreground">
              Prices {treatment === "inclusive" ? "include" : "exclude"} tax, using the
              organisation&apos;s current sales tax treatment.
            </p>
          </FormControlShell>
        </FormGrid>
      }
      lines={
        <OrderEntryLines
          lines={lines}
          onChange={setLines}
          accounts={(accounts.data ?? []).filter((a) => a.is_active && a.is_postable)}
          companyId={companyId}
          currency={currency}
          disabled={mutation.isPending}
        />
      }
      totals={
        <TotalsSummary
          aria-label="Sales order totals"
          lines={
            totals
              ? [
                  {
                    id: "subtotal",
                    label: "Subtotal",
                    value: fmt.money(totals.subtotal_minor, currency),
                  },
                  {
                    id: "tax",
                    label: treatment === "inclusive" ? "Tax (included)" : "Tax",
                    value: fmt.money(totals.tax_minor, currency),
                    emphasis: "muted",
                  },
                  {
                    id: "total",
                    label: "Total",
                    value: fmt.money(totals.total_minor, currency),
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
      stickyActions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={mutation.isPending || !can("sales.draft") || !contactId || !totals}
            onClick={() => mutation.mutate()}
          >
            Save draft
          </Button>
        </div>
      }
    />
  );
}
