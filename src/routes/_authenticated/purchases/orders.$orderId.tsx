import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import {
  changePurchaseOrderStatus,
  convertPurchaseOrderToBill,
  getPurchaseOrder,
  receivePurchaseOrderGoods,
} from "@/lib/purchases/purchases.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { impliedDiscountMinor } from "@/lib/purchases/po-convert";
import { receiveAllOutstanding, remainingToReceive } from "@/lib/purchases/po-receipt";
import { billableQuantity } from "@/lib/purchases/po-partial-bill";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { StatusBadge } from "@/components/common/stat-card";
import { TableCard } from "@/components/common/table-card";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { DocumentRecordPanel } from "@/components/documents/DocumentRecordPanel";
import { RecordDiscussButton } from "@/components/messaging/RecordDiscussButton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export const Route = createFileRoute("/_authenticated/purchases/orders/$orderId")({
  component: PurchaseOrderPage,
});
function PurchaseOrderPage() {
  const { orderId } = Route.useParams();
  const { company } = useActiveCompany();
  return company ? (
    <PurchaseOrderDetail
      key={`${company.id}:${orderId}`}
      companyId={company.id}
      orderId={orderId}
    />
  ) : (
    <EmptyState title="No organisation" description="Select a company." />
  );
}
function PurchaseOrderDetail({ companyId, orderId }: { companyId: string; orderId: string }) {
  const fmt = useFormat();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchOrder = useServerFn(getPurchaseOrder);
  const changeStatus = useServerFn(changePurchaseOrderStatus);
  const convert = useServerFn(convertPurchaseOrderToBill);
  const receiveGoods = useServerFn(receivePurchaseOrderGoods);
  const [cancelOpen, setCancelOpen] = useState(false);
  const query = useQuery({
    queryKey: ["purchase-order", companyId, orderId],
    queryFn: () => fetchOrder({ data: { companyId, orderId } }),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchase-order", companyId, orderId] }),
      queryClient.invalidateQueries({ queryKey: ["orders", companyId] }),
      queryClient.invalidateQueries({
        queryKey: ["printable-document", companyId, "purchase_order", orderId],
      }),
    ]);
  };
  const statusMutation = useMutation({
    mutationFn: (status: "sent" | "cancelled") =>
      changeStatus({ data: { companyId, orderId, status } }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(
        result.status === "sent"
          ? "Marked as sent. This did not send an email."
          : "Purchase order cancelled",
      );
    },
    onError: async (e) => {
      toast.error(friendlyAuthError(e));
      await refresh();
    },
  });
  const convertMutation = useMutation({
    mutationFn: () => convert({ data: { companyId, orderId } }),
    onSuccess: async (result) => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["bills", companyId] });
      toast.success(
        result.fullyBilled
          ? "Draft bill created from received goods. Order is fully billed."
          : "Draft bill created from received goods. Order remains open for further receipts.",
      );
      navigate({ to: "/purchases/bills/$billId", params: { billId: result.billId } });
    },
    onError: async (e) => {
      toast.error(friendlyAuthError(e));
      await refresh();
    },
  });
  const receiveMutation = useMutation({
    mutationFn: (lines: Array<{ lineId: string; receiveQuantity: number }>) =>
      receiveGoods({ data: { companyId, orderId, lines } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Goods receipt recorded. No ledger entry was posted.");
    },
    onError: async (e) => {
      toast.error(friendlyAuthError(e));
      await refresh();
    },
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState
        onRetry={() => void query.refetch()}
        title="Could not load purchase order"
        description={friendlyAuthError(query.error)}
      />
    );
  const order = query.data;
  const currency = order.currency_code.trim();
  const pending =
    statusMutation.isPending || convertMutation.isPending || receiveMutation.isPending;
  const editableStatus = order.status !== "billed" && ["draft", "sent"].includes(order.status);
  const canReceive = ["sent", "partially_received"].includes(order.status);
  const outstanding = receiveAllOutstanding(
    order.purchase_order_lines.map((line) => ({
      lineId: line.id,
      orderedQuantity: Number(line.quantity),
      quantityReceived: Number(line.quantity_received ?? 0),
    })),
  );
  const billableLines = order.purchase_order_lines.filter(
    (line) =>
      billableQuantity({
        orderedQuantity: Number(line.quantity),
        quantityReceived: Number(line.quantity_received ?? 0),
        quantityBilled: Number(line.quantity_billed ?? 0),
      }) > 0,
  );
  return (
    <>
      <RecordWorkspace
        title={order.order_number || "Purchase order"}
        description={`${order.contacts?.name ?? "Supplier"} · ${fmt.date(order.order_date)} · ${currency}`}
        meta={<StatusBadge status={order.status} />}
        insights={
          <WorkspaceInsights
            title="Related"
            facts={[
              { label: "Status", value: order.status.replaceAll("_", " ") },
              { label: "Total", value: fmt.money(order.total_minor, currency) },
              {
                label: "Ledger impact",
                value: "None until converted bill is authorised",
              },
            ]}
            links={[
              ...(order.contact_id
                ? [
                    {
                      label: order.contacts?.name ?? "Supplier",
                      to: "/contacts/$contactId",
                      params: { contactId: order.contact_id },
                      hint: "Open supplier contact",
                    },
                  ]
                : []),
              {
                label: "All orders",
                to: "/purchases/orders",
                hint: "Return to purchase orders",
              },
              ...(order.billed_bill_id
                ? [
                    {
                      label: "Converted bill",
                      to: "/purchases/bills/$billId",
                      params: { billId: order.billed_bill_id },
                      hint: "Bill created from this order",
                    },
                  ]
                : []),
            ]}
            footer="Purchase orders never post. Converted bills affect the ledger only when authorised."
          />
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/purchases/orders">All orders</Link>
            </Button>
            <RecordDiscussButton
              companyId={companyId}
              recordType="purchase_order"
              recordId={orderId}
              title={order.order_number ? `PO ${order.order_number}` : "Purchase order discussion"}
              label="Discuss"
            />
          </div>
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          {editableStatus && can("purchases.draft") ? (
            <>
              {order.status === "draft" ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/purchases/orders/new" search={{ edit: orderId }}>
                    Edit draft
                  </Link>
                </Button>
              ) : null}
              {order.status === "draft" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => statusMutation.mutate("sent")}
                >
                  Mark as sent
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setCancelOpen(true)}
              >
                Cancel order
              </Button>
            </>
          ) : null}
          {canReceive && can("purchases.draft") && outstanding.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => receiveMutation.mutate(outstanding)}
            >
              Receive remaining goods
            </Button>
          ) : null}
          {canReceive && can("purchases.draft") && billableLines.length > 0 ? (
            <Button size="sm" disabled={pending} onClick={() => convertMutation.mutate()}>
              Bill received goods
            </Button>
          ) : null}
          {order.billed_bill_id ? (
            <Button size="sm" variant="outline" asChild>
              <Link to="/purchases/bills/$billId" params={{ billId: order.billed_bill_id }}>
                View bill
              </Link>
            </Button>
          ) : null}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          This order has no ledger impact. Receiving updates quantities only. Bill received goods
          creates a draft bill for unbilled received quantities; the ledger posts only when that
          bill is authorised. Inventory/COGS valuation is not claimed by this flow.
        </p>
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...order.purchase_order_lines]
                .sort((a, b) => a.line_no - b.line_no)
                .map((line) => {
                  const state = {
                    lineId: line.id,
                    orderedQuantity: Number(line.quantity),
                    quantityReceived: Number(line.quantity_received ?? 0),
                  };
                  const billedQty = Number(line.quantity_billed ?? 0);
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{line.description}</TableCell>
                      <TableCell className="text-right">
                        {fmt.number(state.orderedQuantity)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmt.number(state.quantityReceived)}
                      </TableCell>
                      <TableCell className="text-right">{fmt.number(billedQty)}</TableCell>
                      <TableCell className="text-right">
                        {fmt.number(remainingToReceive(state))}
                      </TableCell>
                      <TableCell className="money">
                        {fmt.money(line.unit_price_minor, currency)}
                      </TableCell>
                      <TableCell className="money">
                        {fmt.money(impliedDiscountMinor(line), currency)}
                      </TableCell>
                      <TableCell className="money">{fmt.money(line.net_minor, currency)}</TableCell>
                      <TableCell className="money">
                        {fmt.money(line.tax_minor, currency)}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({fmt.percentBps(line.tax_rate_bps)})
                        </span>
                      </TableCell>
                      <TableCell className="money">
                        {fmt.money(BigInt(line.net_minor) + BigInt(line.tax_minor), currency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableCard>
        <dl className="my-5 ml-auto grid max-w-sm grid-cols-2 gap-2 text-sm">
          <dt>Subtotal</dt>
          <dd className="text-right">{fmt.money(order.subtotal_minor, currency)}</dd>
          <dt>Tax</dt>
          <dd className="text-right">{fmt.money(order.tax_minor, currency)}</dd>
          <dt className="font-semibold">Total ({currency})</dt>
          <dd className="text-right font-semibold">{fmt.money(order.total_minor, currency)}</dd>
        </dl>
        {order.memo ? (
          <section className="my-4 rounded-md border p-4">
            <h2 className="mb-2 font-medium">Supplier instructions / memo</h2>
            <p className="whitespace-pre-wrap text-sm">{order.memo}</p>
          </section>
        ) : null}
        <DocumentActions kind="purchase_order" id={orderId} />
        <DocumentRecordPanel entityType="purchase_order" entityId={orderId} audience="supplier" />
      </RecordWorkspace>
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this purchase order?</AlertDialogTitle>
            <AlertDialogDescription>
              The order stays in your records and cannot be converted to a bill. This does not
              notify the supplier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => statusMutation.mutate("cancelled")}
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
