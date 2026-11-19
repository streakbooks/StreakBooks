import { useRef, useState } from "react";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import {
  convertPurchaseOrderToBill,
  getPurchaseOrder,
  savePurchaseOrder,
} from "@/lib/purchases/purchases.functions";
import {
  getPurchaseOrderActivity,
  managePurchaseOrder,
  receivePurchaseOrder,
  reversePurchaseReceipt,
} from "@/lib/purchases/po-controls.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { impliedDiscountMinor } from "@/lib/purchases/po-convert";
import { remainingToReceive } from "@/lib/purchases/po-receipt";
import { billableQuantity } from "@/lib/purchases/po-partial-bill";
import {
  formatPurchaseQuantity,
  isPurchaseOrderLate,
  purchaseOrderCopyInput,
} from "@/lib/purchases/po-presentation";
import type { PurchaseOrderDetail } from "@/lib/purchases/purchase-order-data";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { EmptyState, LoadingState } from "@/components/common/states";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { StatusBadge } from "@/components/common/stat-card";
import { TableCard } from "@/components/common/table-card";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { DocumentRecordPanel } from "@/components/documents/DocumentRecordPanel";
import { RecordDiscussButton } from "@/components/messaging/RecordDiscussButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrderAction = "submit" | "approve" | "reject" | "reset" | "send" | "cancel";
const actionLabels: Record<OrderAction, string> = {
  submit: "Submit for approval",
  approve: "Approve order",
  reject: "Reject order",
  reset: "Return to draft",
  send: "Mark as sent",
  cancel: "Cancel order",
};
const todayDate = () => new Date().toISOString().slice(0, 10);

export function PurchaseOrderDetailScreen({
  companyId,
  orderId,
}: {
  companyId: string;
  orderId: string;
}) {
  const fmt = useFormat();
  const formatQuantity = (value: number) => formatPurchaseQuantity(value, fmt.locale);
  const { can } = useCan();
  const { user } = useRouteContext({ from: "/_authenticated" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchOrder = useServerFn(getPurchaseOrder);
  const fetchActivity = useServerFn(getPurchaseOrderActivity);
  const manage = useServerFn(managePurchaseOrder);
  const convert = useServerFn(convertPurchaseOrderToBill);
  const save = useServerFn(savePurchaseOrder);
  const receive = useServerFn(receivePurchaseOrder);
  const reverse = useServerFn(reversePurchaseReceipt);
  const [action, setAction] = useState<OrderAction | null>(null);
  const [comment, setComment] = useState("");
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptDate, setReceiptDate] = useState(todayDate);
  const [reference, setReference] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const receiptRequest = useRef(crypto.randomUUID());
  const duplicateRequest = useRef(crypto.randomUUID());
  const reversalRequest = useRef(crypto.randomUUID());
  const [reversalId, setReversalId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const query = useQuery({
    queryKey: ["purchase-order", companyId, orderId],
    queryFn: () => fetchOrder({ data: { companyId, orderId } }),
  });
  const activity = useQuery({
    queryKey: ["purchase-order-activity", companyId, orderId],
    queryFn: () => fetchActivity({ data: { companyId, orderId } }),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchase-order", companyId, orderId] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-order-activity", companyId, orderId] }),
      queryClient.invalidateQueries({ queryKey: ["orders", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["bills", companyId] }),
      queryClient.invalidateQueries({
        queryKey: ["printable-document", companyId, "purchase_order", orderId],
      }),
    ]);
  };
  const failure = async (error: unknown) => {
    toast.error(friendlyAuthError(error));
    await refresh();
  };
  const actionMutation = useMutation({
    mutationFn: (selected: OrderAction) =>
      manage({
        data: {
          companyId,
          orderId,
          version: query.data!.version,
          action: selected,
          payload: { comment },
        },
      }),
    onSuccess: async (_, selected) => {
      setAction(null);
      setComment("");
      await refresh();
      toast.success(
        selected === "send"
          ? "Marked as sent. Supplier delivery is recorded separately."
          : "Purchase order updated",
      );
    },
    onError: failure,
  });
  const convertMutation = useMutation({
    mutationFn: () => convert({ data: { companyId, orderId } }),
    onSuccess: async (result) => {
      await refresh();
      toast.success("Draft bill created from unbilled received goods");
      navigate({ to: "/purchases/bills/$billId", params: { billId: result.billId } });
    },
    onError: failure,
  });
  const duplicateMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          ...purchaseOrderCopyInput(query.data!, todayDate(), duplicateRequest.current),
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["orders", companyId] });
      toast.success("New draft created from ordered items");
      navigate({ to: "/purchases/orders/$orderId", params: { orderId: result.id } });
    },
    onError: failure,
  });
  const receiveMutation = useMutation({
    mutationFn: () =>
      receive({
        data: {
          companyId,
          orderId,
          requestId: receiptRequest.current,
          receiptDate,
          reference,
          lines: Object.entries(quantities)
            .filter(([, value]) => Number(value) > 0)
            .map(([lineId, value]) => ({ lineId, receiveQuantity: Number(value) })),
        },
      }),
    onSuccess: async () => {
      setReceiptOpen(false);
      receiptRequest.current = crypto.randomUUID();
      setQuantities({});
      setReference("");
      await refresh();
      toast.success("Goods receipt recorded");
    },
    onError: failure,
  });
  const reverseMutation = useMutation({
    mutationFn: () =>
      reverse({
        data: {
          companyId,
          orderId,
          receiptId: reversalId!,
          requestId: reversalRequest.current,
          reason: reversalReason,
        },
      }),
    onSuccess: async () => {
      setReversalId(null);
      setReversalReason("");
      reversalRequest.current = crypto.randomUUID();
      await refresh();
      toast.success("Receipt reversed");
    },
    onError: failure,
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError && query.data === undefined) {
    return <QueryErrorState queries={[query]} title="Could not load purchase order" />;
  }
  const order = query.data;
  if (!order)
    return (
      <EmptyState
        title="Purchase order unavailable"
        description="Refresh the purchase orders list."
      />
    );
  const currency = order.currency_code.trim();
  const approval = order.approval_state;
  const draft = order.status === "draft";
  const controlsAvailable = Boolean(approval);
  const editable = draft && ["draft", "rejected"].includes(approval ?? "");
  const receivable = ["sent", "partially_received"].includes(order.status);
  const pending =
    actionMutation.isPending ||
    convertMutation.isPending ||
    receiveMutation.isPending ||
    reverseMutation.isPending ||
    duplicateMutation.isPending;
  const lines = [...order.purchase_order_lines].sort((a, b) => a.line_no - b.line_no);
  const outstanding = lines.reduce(
    (total, line) =>
      total +
      remainingToReceive({
        lineId: line.id,
        orderedQuantity: Number(line.quantity),
        quantityReceived: Number(line.quantity_received ?? 0),
      }),
    0,
  );
  const billable = lines.reduce(
    (total, line) =>
      total +
      billableQuantity({
        orderedQuantity: Number(line.quantity),
        quantityReceived: Number(line.quantity_received ?? 0),
        quantityBilled: Number(line.quantity_billed ?? 0),
      }),
    0,
  );
  const isLate = isPurchaseOrderLate({
    status: order.status,
    expectedDeliveryDate: order.expected_delivery_date ?? null,
    outstandingQuantity: outstanding,
    today: todayDate(),
  });
  const canDecide =
    can("purchases.authorise") &&
    approval === "pending" &&
    order.submitted_by !== user.id &&
    order.created_by !== user.id;
  const receiptValid =
    receiptDate &&
    Object.entries(quantities).some(([, value]) => Number(value) > 0) &&
    Object.entries(quantities).every(([id, value]) => {
      const quantity = Number(value || 0);
      const line = lines.find((row) => row.id === id);
      return (
        line &&
        Number.isFinite(quantity) &&
        quantity >= 0 &&
        quantity === Number(quantity.toFixed(6)) &&
        quantity <=
          remainingToReceive({
            lineId: id,
            orderedQuantity: Number(line.quantity),
            quantityReceived: Number(line.quantity_received ?? 0),
          })
      );
    });
  const openAction = (selected: OrderAction) => {
    setComment("");
    setAction(selected);
  };
  const openReceipt = () => {
    receiptRequest.current = crypto.randomUUID();
    setReceiptDate(todayDate());
    setReference("");
    setQuantities({});
    setReceiptOpen(true);
  };
  const receiptChange = (id: string, value: string) => {
    receiptRequest.current = crypto.randomUUID();
    setQuantities((current) => ({ ...current, [id]: value }));
  };
  return (
    <>
      <RecordWorkspace
        title={order.order_number || "Purchase order"}
        description={`${order.contacts?.name ?? "Supplier"} · ${fmt.date(order.order_date)} · ${currency}`}
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={order.status} />
            {approval ? (
              <StatusBadge status={approval === "pending" ? "awaiting_approval" : approval} />
            ) : null}
          </div>
        }
        insights={
          <WorkspaceInsights
            title="Order overview"
            facts={[
              { label: "Order total", value: fmt.money(order.total_minor, currency) },
              {
                label: "Expected delivery",
                value: order.expected_delivery_date
                  ? fmt.date(order.expected_delivery_date)
                  : "Not scheduled",
              },
              {
                label: "Supplier acknowledgement",
                value: order.acknowledged_on
                  ? fmt.date(order.acknowledged_on)
                  : "Awaiting acknowledgement",
              },
              { label: "Remaining to receive", value: formatQuantity(outstanding) },
              { label: "Received, unbilled", value: formatQuantity(billable) },
            ]}
            links={[
              {
                label: order.contacts?.name ?? "Supplier",
                to: "/contacts/$contactId",
                params: { contactId: order.contact_id },
                hint: "Open supplier contact",
              },
              {
                label: "All purchase orders",
                to: "/purchases/orders",
                hint: "Return to order workspace",
              },
            ]}
            footer="Order approval and receiving do not post to the ledger."
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
            {can("purchases.draft") ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => duplicateMutation.mutate()}
              >
                Duplicate as draft
              </Button>
            ) : null}
          </div>
        }
      >
        {!controlsAvailable ? (
          <Alert className="mb-4">
            <AlertTitle>Order controls unavailable</AlertTitle>
            <AlertDescription>
              The purchase-order lifecycle migration must be applied before approval or fulfilment
              actions are available.
            </AlertDescription>
          </Alert>
        ) : null}
        {isLate ? (
          <Alert className="mb-4">
            <AlertTitle>Delivery overdue</AlertTitle>
            <AlertDescription>
              Goods remain outstanding after the promised delivery date. Follow up with the supplier
              and update the delivery plan.
            </AlertDescription>
          </Alert>
        ) : null}
        {approval === "rejected" ? (
          <Alert className="mb-4">
            <AlertTitle>Approval declined</AlertTitle>
            <AlertDescription>
              {order.approval_comment || "Review the order and submit a revised draft."}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="mb-5 flex flex-wrap gap-2 print:hidden">
          {can("purchases.draft") && editable ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link to="/purchases/orders/new" search={{ edit: orderId }}>
                  Edit items
                </Link>
              </Button>
              <Button size="sm" disabled={pending} onClick={() => openAction("submit")}>
                Submit for approval
              </Button>
            </>
          ) : null}
          {canDecide ? (
            <>
              <Button size="sm" disabled={pending} onClick={() => openAction("approve")}>
                Approve order
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => openAction("reject")}
              >
                Reject order
              </Button>
            </>
          ) : null}
          {approval === "pending" && order.submitted_by === user.id ? (
            <p className="self-center text-sm text-muted-foreground">
              Another authorised user must review your order.
            </p>
          ) : null}
          {can("purchases.draft") &&
          draft &&
          ["pending", "approved", "rejected"].includes(approval ?? "") ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => openAction("reset")}
            >
              Return to draft
            </Button>
          ) : null}
          {can("purchases.draft") && draft && approval === "approved" ? (
            <Button size="sm" disabled={pending} onClick={() => openAction("send")}>
              Mark as sent
            </Button>
          ) : null}
          {can("purchases.draft") &&
          controlsAvailable &&
          !["cancelled", "billed"].includes(order.status) ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setMetadataOpen(true)}
            >
              Delivery &amp; terms
            </Button>
          ) : null}
          {can("purchases.draft") && controlsAvailable && receivable && outstanding > 0 ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={openReceipt}>
              Record receipt
            </Button>
          ) : null}
          {can("purchases.draft") && controlsAvailable && receivable && billable > 0 ? (
            <Button size="sm" disabled={pending} onClick={() => convertMutation.mutate()}>
              Bill received goods
            </Button>
          ) : null}
          {can("purchases.draft") &&
          controlsAvailable &&
          !["cancelled", "billed"].includes(order.status) &&
          lines.every(
            (line) =>
              Number(line.quantity_received ?? 0) === 0 && Number(line.quantity_billed ?? 0) === 0,
          ) ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => openAction("cancel")}
            >
              Cancel order
            </Button>
          ) : null}
        </div>
        <section
          aria-label="Supplier fulfilment"
          className="mb-5 grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
        >
          <div>
            <h2 className="font-medium">Supplier reference</h2>
            <p className="mt-1 text-sm">{order.supplier_reference || "Not provided"}</p>
          </div>
          <div>
            <h2 className="font-medium">Delivery address</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm">
              {order.delivery_address || "Not provided"}
            </p>
          </div>
          {order.terms ? (
            <div className="sm:col-span-2">
              <h2 className="font-medium">Terms</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{order.terms}</p>
            </div>
          ) : null}
        </section>
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">To receive</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-right">
                    {formatQuantity(Number(line.quantity))}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatQuantity(Number(line.quantity_received ?? 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatQuantity(Number(line.quantity_billed ?? 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatQuantity(
                      remainingToReceive({
                        lineId: line.id,
                        orderedQuantity: Number(line.quantity),
                        quantityReceived: Number(line.quantity_received ?? 0),
                      }),
                    )}
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
              ))}
            </TableBody>
          </Table>
        </TableCard>
        <div className="my-5 flex justify-end">
          <TotalsSummary
            aria-label="Purchase order totals"
            lines={[
              {
                id: "subtotal",
                label: "Subtotal",
                value: fmt.money(order.subtotal_minor, currency),
              },
              {
                id: "tax",
                label: "Tax",
                value: fmt.money(order.tax_minor, currency),
                emphasis: "muted",
              },
              {
                id: "total",
                label: `Total (${currency})`,
                value: fmt.money(order.total_minor, currency),
                emphasis: "total",
              },
            ]}
          />
        </div>
        {order.memo ? (
          <section className="my-4 rounded-md border p-4">
            <h2 className="mb-2 font-medium">Supplier instructions</h2>
            <p className="whitespace-pre-wrap text-sm">{order.memo}</p>
          </section>
        ) : null}
        <section className="my-6 space-y-3" aria-label="Order activity">
          <h2 className="font-semibold">Receipts, bills &amp; history</h2>
          {activity.isPending ? (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          ) : activity.isError ? (
            <QueryErrorState queries={[activity]} title="Could not load order activity" />
          ) : (
            <>
              <h3 className="text-sm font-medium">Goods receipts</h3>
              {activity.data?.receipts.length ? (
                <ul className="divide-y rounded-lg border">
                  {activity.data.receipts.map((receipt) => (
                    <li key={receipt.id} className="p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm">
                          <strong>{receipt.reference || "Goods receipt"}</strong> ·{" "}
                          {fmt.date(receipt.receipt_date)}
                          {receipt.reversed_at ? " · Reversed" : ""}
                        </p>
                        {can("purchases.draft") && !receipt.reversed_at ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => {
                              reversalRequest.current = crypto.randomUUID();
                              setReversalReason("");
                              setReversalId(receipt.id);
                            }}
                          >
                            Reverse receipt
                          </Button>
                        ) : null}
                      </div>
                      <ul className="mt-2 text-sm text-muted-foreground">
                        {receipt.lines.map((line) => (
                          <li key={line.line_id}>
                            {lines.find((row) => row.id === line.line_id)?.description ??
                              "Order line"}
                            : {formatQuantity(Number(line.quantity))}
                          </li>
                        ))}
                      </ul>
                      {receipt.reversal_reason ? (
                        <p className="mt-2 text-sm">Reason: {receipt.reversal_reason}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No receipt documents recorded.</p>
              )}
              <h3 className="pt-2 text-sm font-medium">Linked bills</h3>
              {activity.data?.bills.length ? (
                <ul className="divide-y rounded-lg border">
                  {activity.data.bills.map((bill) => (
                    <li key={bill.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                      <Link
                        className="text-primary underline"
                        to="/purchases/bills/$billId"
                        params={{ billId: bill.id }}
                      >
                        {bill.bill_number || "Draft bill"}
                      </Link>
                      <span>
                        {fmt.date(bill.bill_date)} · {bill.status.replaceAll("_", " ")} ·{" "}
                        {fmt.money(bill.total_minor, bill.currency_code)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No bills created from this order.</p>
              )}
              <h3 className="pt-2 text-sm font-medium">Audit history</h3>
              {activity.data?.history.length ? (
                <ol className="divide-y rounded-lg border">
                  {activity.data.history.map((event) => (
                    <li key={event.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                      <span>{event.action.replaceAll("_", " ").replaceAll(".", " ")}</span>
                      <time dateTime={event.created_at} className="text-muted-foreground">
                        {fmt.dateTime(event.created_at)}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No activity recorded.</p>
              )}
            </>
          )}
        </section>
        <DocumentActions kind="purchase_order" id={orderId} />
        <DocumentRecordPanel entityType="purchase_order" entityId={orderId} audience="supplier" />
      </RecordWorkspace>
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !actionMutation.isPending) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? actionLabels[action] : "Order action"}</DialogTitle>
            <DialogDescription>
              {action === "send"
                ? "Record that this approved order was sent to the supplier. Use Send & share to email the order and inspect delivery outcomes."
                : action === "cancel"
                  ? "This order remains in the audit history. Cancel only when there are no received or billed goods. Supplier notification is separate."
                  : action === "reset"
                    ? "Approval will be cleared so you can revise the draft. The revised order must be approved again."
                    : "Your decision is recorded in the order audit history. A submitted order must be approved by another authorised user."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="order-action-comment">
              {action === "reject" || action === "cancel"
                ? "Reason (required)"
                : "Comment (optional)"}
            </Label>
            <Textarea
              id="order-action-comment"
              value={comment}
              maxLength={2000}
              disabled={actionMutation.isPending}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={actionMutation.isPending}
              onClick={() => setAction(null)}
            >
              Back
            </Button>
            <Button
              disabled={
                pending ||
                ((action === "reject" || action === "cancel") && comment.trim().length < 3)
              }
              onClick={() => action && actionMutation.mutate(action)}
            >
              {actionMutation.isPending ? "Saving…" : action ? actionLabels[action] : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={receiptOpen}
        onOpenChange={(open) => {
          if (!receiveMutation.isPending) setReceiptOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record goods receipt</DialogTitle>
            <DialogDescription>
              Enter the additional quantities received. Leave items that have not arrived blank.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={receiveMutation.isPending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="receipt-date">Receipt date</Label>
                <Input
                  id="receipt-date"
                  type="date"
                  value={receiptDate}
                  max={todayDate()}
                  onChange={(e) => {
                    receiptRequest.current = crypto.randomUUID();
                    setReceiptDate(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receipt-reference">Delivery / receipt reference</Label>
                <Input
                  id="receipt-reference"
                  maxLength={120}
                  value={reference}
                  onChange={(e) => {
                    receiptRequest.current = crypto.randomUUID();
                    setReference(e.target.value);
                  }}
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                receiptRequest.current = crypto.randomUUID();
                setQuantities(
                  Object.fromEntries(
                    lines.map((line) => [
                      line.id,
                      String(
                        remainingToReceive({
                          lineId: line.id,
                          orderedQuantity: Number(line.quantity),
                          quantityReceived: Number(line.quantity_received ?? 0),
                        }),
                      ),
                    ]),
                  ),
                );
              }}
            >
              Fill outstanding quantities
            </Button>
            {lines.map((line) => {
              const remaining = remainingToReceive({
                lineId: line.id,
                orderedQuantity: Number(line.quantity),
                quantityReceived: Number(line.quantity_received ?? 0),
              });
              return (
                <div key={line.id} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                  <Label htmlFor={`receipt-${line.id}`}>
                    {line.description}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatQuantity(remaining)} remaining
                    </span>
                  </Label>
                  <Input
                    id={`receipt-${line.id}`}
                    inputMode="decimal"
                    value={quantities[line.id] ?? ""}
                    disabled={remaining === 0}
                    placeholder="0"
                    onChange={(e) => receiptChange(line.id, e.target.value)}
                  />
                </div>
              );
            })}
          </fieldset>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={receiveMutation.isPending}
              onClick={() => setReceiptOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending || !receiptValid} onClick={() => receiveMutation.mutate()}>
              {receiveMutation.isPending ? "Recording…" : "Record receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={reversalId !== null}
        onOpenChange={(open) => {
          if (!open && !reverseMutation.isPending) setReversalId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse receipt</DialogTitle>
            <DialogDescription>
              Reverse the complete receipt when goods were recorded incorrectly. A receipt cannot be
              reversed if the remaining received quantity would be below billed quantity. Resolve
              linked draft bills first.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="receipt-reversal-reason">Reason</Label>
          <Textarea
            id="receipt-reversal-reason"
            maxLength={2000}
            disabled={reverseMutation.isPending}
            value={reversalReason}
            onChange={(e) => {
              reversalRequest.current = crypto.randomUUID();
              setReversalReason(e.target.value);
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={reverseMutation.isPending}
              onClick={() => setReversalId(null)}
            >
              Keep receipt
            </Button>
            <Button
              disabled={pending || reversalReason.trim().length < 3}
              onClick={() => reverseMutation.mutate()}
            >
              {reverseMutation.isPending ? "Reversing…" : "Reverse receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {metadataOpen ? (
        <FulfilmentEditor
          order={order}
          companyId={companyId}
          onClose={() => setMetadataOpen(false)}
          onSaved={refresh}
        />
      ) : null}
    </>
  );
}

function FulfilmentEditor({
  order,
  companyId,
  onClose,
  onSaved,
}: {
  order: PurchaseOrderDetail;
  companyId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const manage = useServerFn(managePurchaseOrder);
  const [supplierReference, setSupplierReference] = useState(order.supplier_reference ?? "");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    order.expected_delivery_date ?? "",
  );
  const [acknowledgedOn, setAcknowledgedOn] = useState(order.acknowledged_on ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(order.delivery_address ?? "");
  const [terms, setTerms] = useState(order.terms ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      manage({
        data: {
          companyId,
          orderId: order.id,
          version: order.version,
          action: "metadata",
          payload: {
            supplierReference,
            expectedDeliveryDate: expectedDeliveryDate || null,
            acknowledgedOn: acknowledgedOn || null,
            deliveryAddress,
            terms,
          },
        },
      }),
    onSuccess: async () => {
      await onSaved();
      onClose();
      toast.success("Delivery details saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery &amp; terms</DialogTitle>
          <DialogDescription>
            Record the supplier's confirmation and delivery plan.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={mutation.isPending} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="po-supplier-reference">Supplier reference</Label>
            <Input
              id="po-supplier-reference"
              maxLength={120}
              value={supplierReference}
              onChange={(e) => setSupplierReference(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="po-delivery-date">Expected delivery date</Label>
              <Input
                id="po-delivery-date"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-acknowledged">Supplier acknowledged on</Label>
              <Input
                id="po-acknowledged"
                type="date"
                max={todayDate()}
                value={acknowledgedOn}
                onChange={(e) => setAcknowledgedOn(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-delivery-address">Delivery address</Label>
            <Textarea
              id="po-delivery-address"
              maxLength={2000}
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-terms">Purchase terms</Label>
            <Textarea
              id="po-terms"
              disabled={order.status !== "draft" || order.approval_state === "pending"}
              maxLength={4000}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
