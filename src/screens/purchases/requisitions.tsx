import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { fromMinorUnits } from "@/lib/accounting/money";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { listSuppliers } from "@/lib/purchases/purchases.functions";
import {
  emptyOrderLine,
  orderLinesFromForm,
  type PurchaseOrderLineForm,
} from "@/lib/purchases/purchase-order";
import { sumLines } from "@/lib/purchases/line-math";
import { createEmptyDocumentLines } from "@/lib/ui/document-line-defaults";
import {
  listPurchaseRequisitions,
  savePurchaseRequisition,
  managePurchaseRequisition,
  requisitionStatuses,
  type Requisition,
  type RequisitionAction,
  type RequisitionStatus,
} from "@/lib/purchases/requisitions.functions";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
import { ContactLookup } from "@/components/lookup";
import { OrderEntryLines } from "@/components/orders/OrderEntryLines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PurchasesRequisitionsScreen({
  forceCreate = false,
  onCreateClosed,
}: {
  forceCreate?: boolean;
  onCreateClosed?: () => void;
} = {}) {
  const { company } = useActiveCompany();
  return company ? (
    <RequisitionsWorkspace
      key={company.id}
      companyId={company.id}
      baseCurrency={company.base_currency}
      forceCreate={forceCreate}
      {...(onCreateClosed ? { onCreateClosed } : {})}
    />
  ) : (
    <EmptyState
      title="No organisation"
      description="Select an organisation to review purchase requisitions."
    />
  );
}
function RequisitionsWorkspace({
  companyId,
  baseCurrency,
  forceCreate = false,
  onCreateClosed,
}: {
  companyId: string;
  baseCurrency: string;
  forceCreate?: boolean;
  onCreateClosed?: () => void;
}) {
  const { can } = useCan();
  const fmt = useFormat();
  const client = useQueryClient();
  const fetch = useServerFn(listPurchaseRequisitions);
  const manage = useServerFn(managePurchaseRequisition);
  const [status, setStatus] = useState<RequisitionStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Requisition | null>(null);
  const [editor, setEditor] = useState<Requisition | "new" | null>(null);
  const [comment, setComment] = useState("");
  const canDraft = can("purchases.draft");
  useEffect(() => {
    if (!forceCreate || !canDraft) return;
    setEditor("new");
  }, [forceCreate, canDraft]);

  function closeEditor() {
    const wasCreate = editor === "new" && forceCreate;
    setEditor(null);
    if (wasCreate) onCreateClosed?.();
  }
  const query = useQuery({
    queryKey: ["purchase-requisitions", companyId, status, search, page],
    enabled: can("purchases.view"),
    queryFn: () => fetch({ data: { companyId, status, search, page } }),
  });
  const mutation = useMutation({
    mutationFn: (action: RequisitionAction) =>
      manage({
        data: { companyId, id: selected!.id, version: selected!.version, action, comment },
      }),
    onSuccess: async (row) => {
      setSelected(row);
      setComment("");
      await client.invalidateQueries({ queryKey: ["purchase-requisitions", companyId] });
      await client.invalidateQueries({ queryKey: ["orders", companyId] });
      toast.success(row.status === "ordered" ? "Purchase order created" : "Requisition updated");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  if (!can("purchases.view"))
    return (
      <EmptyState
        title="Access restricted"
        description="Purchase viewing permission is required."
      />
    );
  if (editor) {
    return (
      <RequisitionEditor
        key={editor === "new" ? "new" : editor.id}
        companyId={companyId}
        baseCurrency={baseCurrency}
        initial={editor === "new" ? undefined : editor}
        onSaved={async (row) => {
          closeEditor();
          setSelected(row);
          await client.invalidateQueries({ queryKey: ["purchase-requisitions", companyId] });
        }}
        onCancel={closeEditor}
      />
    );
  }
  const actionButton = (action: RequisitionAction, label: string) => (
    <Button
      key={action}
      disabled={
        mutation.isPending ||
        !can(["approve", "reject"].includes(action) ? "purchases.authorise" : "purchases.draft") ||
        (action === "reject" && comment.trim().length < 3)
      }
      variant={action === "cancel" ? "destructive" : "outline"}
      onClick={() => mutation.mutate(action)}
    >
      {label}
    </Button>
  );
  return (
    <ListWorkspace
      title="Purchase requisitions"
      description="Request purchases, record independent approval, and create a draft order from approved quantities and prices."
      actions={
        can("purchases.draft") ? (
          <Button onClick={() => setEditor("new")}>New requisition</Button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Search requisitions"
          placeholder="Search number or title"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="sm:max-w-sm"
        />
        <RecordLookupSelect
          value={status}
          onValueChange={(value) => {
            setStatus(value as RequisitionStatus | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48" aria-label="Requisition status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* lookup-fixed-enum: Requisition lifecycle statuses. */}
            <SelectItem value="all">All statuses</SelectItem>
            {requisitionStatuses.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </RecordLookupSelect>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError && query.data === undefined ? (
        <QueryErrorState queries={[query]} title="Could not load requisitions" />
      ) : !query.data.rows.length ? (
        <EmptyState
          title={
            search || status !== "all" ? "No matching requisitions" : "No purchase requisitions"
          }
          description={
            search || status !== "all"
              ? "Change the search or status filter."
              : "Create a requisition when a purchase needs independent approval."
          }
          action={
            !search && status === "all" && can("purchases.draft") ? (
              <Button size="sm" onClick={() => setEditor("new")}>
                New requisition
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requisition</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => {
                        setSelected(row);
                        setComment("");
                      }}
                    >
                      {row.requisition_number}
                    </Button>
                    <p className="text-sm text-muted-foreground">{row.title}</p>
                  </TableCell>
                  <TableCell>{row.requested_on}</TableCell>
                  <TableCell>{row.required_on ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt.money(row.total_minor, row.currency_code)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Page {page}
          {query.data ? ` · ${query.data.total} requisitions` : ""}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 1 || query.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={query.isFetching || !query.data || page * 25 >= query.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selected?.requisition_number} · {selected?.title}
            </DialogTitle>
            <DialogDescription>
              Review requested items and approval. A different authorised person must approve the
              request.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline">{selected.status}</Badge>
                <span>Requested {selected.requested_on}</span>
                <span>Required {selected.required_on ?? "not specified"}</span>
              </div>
              <p className="whitespace-pre-wrap">
                {selected.justification || "No justification supplied."}
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit price</TableHead>
                      <TableHead>Discount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.lines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell>{line.description}</TableCell>
                        <TableCell>{line.quantity}</TableCell>
                        <TableCell>
                          {fmt.money(line.unitPriceMinor, selected.currency_code)}
                        </TableCell>
                        <TableCell>
                          {fmt.money(line.discountMinor ?? 0, selected.currency_code)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-right font-semibold">
                Total {fmt.money(selected.total_minor, selected.currency_code)}
              </p>
              {selected.decision_comment ? (
                <p className="rounded-lg bg-muted p-3">Decision: {selected.decision_comment}</p>
              ) : null}
              {selected.submitted_at ? (
                <p className="text-sm text-muted-foreground">
                  Submitted {fmt.date(selected.submitted_at)}
                  {selected.approved_at ? ` · Approved ${fmt.date(selected.approved_at)}` : ""}
                </p>
              ) : null}
              {selected.status === "pending" && can("purchases.authorise") ? (
                <div className="space-y-2">
                  <Label htmlFor="requisition-decision">Decision comment / rejection reason</Label>
                  <Textarea
                    id="requisition-decision"
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {selected.status === "draft" ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={!can("purchases.draft") || mutation.isPending}
                      onClick={() => {
                        setEditor(selected);
                        setSelected(null);
                      }}
                    >
                      Edit draft
                    </Button>
                    {actionButton("submit", "Submit for approval")}
                  </>
                ) : null}
                {selected.status === "pending" ? (
                  <>
                    {actionButton("approve", "Approve")}
                    {actionButton("reject", "Reject")}
                  </>
                ) : null}
                {["approved", "rejected"].includes(selected.status)
                  ? actionButton("reset", "Revise as draft")
                  : null}
                {selected.status === "approved"
                  ? actionButton("convert", "Create purchase order")
                  : null}
                {!["ordered", "cancelled"].includes(selected.status)
                  ? actionButton("cancel", "Cancel requisition")
                  : null}
                {selected.order_id ? (
                  <Button asChild>
                    <Link to="/purchases/orders/$orderId" params={{ orderId: selected.order_id }}>
                      Open purchase order
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
function RequisitionEditor({
  companyId,
  baseCurrency,
  initial,
  onSaved,
  onCancel,
}: {
  companyId: string;
  baseCurrency: string;
  initial: Requisition | undefined;
  onSaved: (row: Requisition) => Promise<void>;
  onCancel?: () => void;
}) {
  const { can } = useCan();
  const fmt = useFormat();
  const save = useServerFn(savePurchaseRequisition);
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchAccounts = useServerFn(listAccounts);
  const requestId = useRef(crypto.randomUUID());
  const [title, setTitle] = useState(initial?.title ?? "");
  const [justification, setJustification] = useState(initial?.justification ?? "");
  const [contactId, setContactId] = useState(initial?.contact_id ?? "");
  const [requestedOn, setRequestedOn] = useState(
    initial?.requested_on ?? new Date().toISOString().slice(0, 10),
  );
  const [requiredOn, setRequiredOn] = useState(initial?.required_on ?? "");
  const [currencyCode, setCurrencyCode] = useState(initial?.currency_code ?? baseCurrency);
  const [lines, setLines] = useState<PurchaseOrderLineForm[]>(
    initial
      ? initial.lines.map((line) => ({
          description: line.description,
          accountId: line.accountId,
          quantity: String(line.quantity),
          unitPrice: fromMinorUnits(line.unitPriceMinor, initial.currency_code),
          discount: fromMinorUnits(line.discountMinor ?? 0, initial.currency_code),
          taxPercent: String((line.taxRateBps ?? 0) / 100),
        }))
      : createEmptyDocumentLines(emptyOrderLine),
  );
  const suppliers = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: () => fetchSuppliers({ data: { companyId } }),
  });
  const accounts = useQuery({
    queryKey: ["accounts", companyId],
    queryFn: () => fetchAccounts({ data: { companyId } }),
  });
  let totals: { subtotal_minor: bigint; tax_minor: bigint; total_minor: bigint } | null = null;
  try {
    totals = sumLines(orderLinesFromForm(lines, currencyCode));
  } catch {
    /* Incomplete input is validated on submit. */
  }
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          requestId: requestId.current,
          ...(initial ? { id: initial.id, version: initial.version } : {}),
          title,
          justification,
          contactId,
          requestedOn,
          ...(requiredOn ? { requiredOn } : {}),
          currencyCode,
          lines: orderLinesFromForm(lines, currencyCode),
        },
      }),
    onSuccess: async (row) => {
      toast.success("Requisition saved");
      await onSaved(row);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const requiredQueries = [suppliers, accounts];
  if (requiredQueries.some((query) => query.isError && query.data === undefined))
    return (
      <QueryErrorState queries={requiredQueries} title="Could not load purchasing options" />
    );
  if (suppliers.isPending || accounts.isPending) return <LoadingState />;
  return (
    <TransactionWorkspace
      title={initial ? "Edit requisition" : "New purchase requisition"}
      description="Amounts and supplier details become fixed when submitted. Changes require a new approval."
      breadcrumbs={[
        { label: "Purchases", to: "/purchases" },
        { label: "Requisitions", to: "/purchases/requisitions" },
        { label: initial ? "Edit" : "New" },
      ]}
      meta={<StatusBadge status="draft" label={initial ? "Editing draft" : "Draft"} />}
      details={
        <FormGrid columns={4}>
          <FormControlShell className="sm:col-span-2">
            <Label htmlFor="req-title">Title</Label>
            <Input
              id="req-title"
              required
              minLength={3}
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell width="contact">
            <Label>Supplier</Label>
            <ContactLookup
              companyId={companyId}
              createKind="supplier"
              ariaLabel="Requisition supplier"
              value={contactId}
              onChange={setContactId}
              contacts={(suppliers.data ?? []) as Array<{ id: string; name: string }>}
              allowClear={false}
            />
          </FormControlShell>
          <FormControlShell width="currency">
            <Label htmlFor="req-currency">Currency</Label>
            <Input
              id="req-currency"
              required
              maxLength={3}
              pattern="[A-Z]{3}"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
            />
          </FormControlShell>
          <FormControlShell width="date">
            <Label htmlFor="req-requested">Request date</Label>
            <Input
              id="req-requested"
              required
              type="date"
              value={requestedOn}
              onChange={(e) => setRequestedOn(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell width="date">
            <Label htmlFor="req-required">Required date</Label>
            <Input
              id="req-required"
              type="date"
              min={requestedOn}
              value={requiredOn}
              onChange={(e) => setRequiredOn(e.target.value)}
            />
          </FormControlShell>
          <FormControlShell className="sm:col-span-2">
            <Label htmlFor="req-justification">Business justification</Label>
            <Textarea
              id="req-justification"
              maxLength={4000}
              rows={2}
              className="lb-spreadsheet-wrap min-h-8"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </FormControlShell>
        </FormGrid>
      }
      lines={
        <OrderEntryLines
          companyId={companyId}
          currency={currencyCode}
          lines={lines}
          onChange={setLines}
          accounts={(
            (accounts.data ?? []) as Array<{
              id: string;
              code: string;
              name: string;
              is_active: boolean;
              is_postable: boolean;
            }>
          ).filter((account) => account.is_active && account.is_postable)}
          disabled={mutation.isPending}
        />
      }
      totals={
        <TotalsSummary
          aria-label="Requisition totals"
          lines={
            totals
              ? [
                  {
                    id: "subtotal",
                    label: "Subtotal",
                    value: fmt.money(totals.subtotal_minor, currencyCode),
                  },
                  {
                    id: "tax",
                    label: "Tax",
                    value: fmt.money(totals.tax_minor, currencyCode),
                    emphasis: "muted",
                  },
                  {
                    id: "total",
                    label: "Total",
                    value: fmt.money(totals.total_minor, currencyCode),
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
          {onCancel ? (
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={mutation.isPending || !can("purchases.draft") || !contactId || !title.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save draft"}
          </Button>
        </div>
      }
    />
  );
}
