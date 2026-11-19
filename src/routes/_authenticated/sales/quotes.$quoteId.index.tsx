import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  convertQuoteToInvoice,
  copyQuote,
  deleteDraftQuote,
  getQuote,
  updateQuoteStatus,
} from "@/lib/sales/sales.functions";
import { useCan } from "@/hooks/use-can";
import { getSalesDocumentConfig } from "@/lib/sales/sales-config.functions";
import { isQuoteConvertible, quoteStatusActions, type QuoteStatus } from "@/lib/sales/quote-status";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { bpsToPercentString, money } from "@/components/sales/sales-form-utils";
import { StatusBadge } from "@/components/common/stat-card";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { Button } from "@/components/ui/button";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { DocumentRecordPanel } from "@/components/documents/DocumentRecordPanel";
import { RecordDiscussButton } from "@/components/messaging/RecordDiscussButton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/sales/quotes/$quoteId/")({
  head: () => ({ meta: [{ title: "Quote — LinkBooks" }] }),
  component: QuoteDetailPage,
});

const ACTION_LABEL: Record<QuoteStatus, string> = {
  draft: "Back to draft",
  sent: "Mark sent",
  accepted: "Mark accepted",
  declined: "Mark declined",
  expired: "Mark expired",
  converted: "Converted",
  void: "Void quote",
};

function QuoteDetailPage() {
  const { quoteId } = Route.useParams();
  const { company } = useActiveCompany();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const companyId = company?.id;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const fetchQuote = useServerFn(getQuote);
  const fetchConfig = useServerFn(getSalesDocumentConfig);
  const doStatus = useServerFn(updateQuoteStatus);
  const doConvert = useServerFn(convertQuoteToInvoice);
  const doDelete = useServerFn(deleteDraftQuote);
  const doCopy = useServerFn(copyQuote);
  const { can } = useCan();

  const query = useQuery({
    queryKey: ["sales-quote", companyId, quoteId],
    enabled: Boolean(companyId),
    queryFn: () => fetchQuote({ data: { companyId: companyId!, quoteId } }),
  });
  const configQ = useQuery({
    queryKey: ["sales-doc-config", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchConfig({ data: { companyId: companyId! } }),
  });

  const statusM = useMutation({
    mutationFn: (status: string) => doStatus({ data: { companyId: companyId!, quoteId, status } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sales-quote", companyId, quoteId] });
      await qc.invalidateQueries({ queryKey: ["sales-quotes", companyId] });
      setVoidOpen(false);
      toast.success("Quote status updated");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const convertM = useMutation({
    mutationFn: () => doConvert({ data: { companyId: companyId!, quoteId } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["sales-quotes", companyId] });
      toast.success("Converted to draft invoice");
      navigate({ to: "/sales/invoices/$invoiceId", params: { invoiceId: r.invoiceId } });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const deleteM = useMutation({
    mutationFn: () => doDelete({ data: { companyId: companyId!, quoteId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sales-quotes", companyId] });
      toast.success("Draft quote deleted");
      navigate({ to: "/sales/quotes" });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const copyM = useMutation({
    mutationFn: () => doCopy({ data: { companyId: companyId!, quoteId } }),
    onSuccess: async (r) => {
      toast.success("Copied to a new draft quote");
      await navigate({ to: "/sales/quotes/$quoteId", params: { quoteId: r.id } });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (query.isPending) return <LoadingState />;
  if (query.isError && query.data === undefined) {
    return <QueryErrorState queries={[query]} title="Could not load quote" />;
  }
  if (!query.data) {
    return <EmptyState title="Quote not found" description="This quote is unavailable." />;
  }

  const q = query.data;
  const cur = q.currency_code;
  const today = configQ.data?.today ?? q.quote_date;
  const convertible = isQuoteConvertible(q, today);
  const actions = quoteStatusActions(q.status).filter((s) => s !== "void");
  const canVoid = quoteStatusActions(q.status).includes("void");
  const lines = [...q.sales_quote_lines].sort((a, b) => a.line_order - b.line_order);

  return (
    <>
      <RecordWorkspace
        title={`Quote ${q.quote_number ?? ""} · ${q.contacts?.name ?? "Customer"}`}
        description={`${q.quote_date}${q.expiry_date ? ` · expires ${q.expiry_date}` : ""} · never posts to the ledger`}
        meta={<StatusBadge status={q.status} />}
        insights={
          <WorkspaceInsights
            title="Related"
            facts={[
              { label: "Status", value: q.status.replaceAll("_", " ") },
              { label: "Total", value: money(q.total_minor, cur) },
              ...(q.expiry_date ? [{ label: "Expires", value: q.expiry_date }] : []),
            ]}
            links={[
              ...(q.contact_id
                ? [
                    {
                      label: q.contacts?.name ?? "Customer",
                      to: "/contacts/$contactId",
                      params: { contactId: q.contact_id },
                      hint: "Open contact record",
                    },
                  ]
                : []),
              {
                label: "All quotes",
                to: "/sales/quotes",
                hint: "Return to the quote list",
              },
              ...(q.converted_invoice_id
                ? [
                    {
                      label: "Converted invoice",
                      to: "/sales/invoices/$invoiceId",
                      params: { invoiceId: q.converted_invoice_id },
                      hint: "Invoice created from this quote",
                    },
                  ]
                : []),
            ]}
            footer="Quotes never post to the ledger. Convert only when the quote is eligible."
          />
        }
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" size="sm" asChild>
              <Link to="/sales/quotes">Back</Link>
            </Button>
            <RecordDiscussButton
              companyId={company?.id ?? null}
              recordType="sales_quote"
              recordId={quoteId}
              title={q.quote_number ? `Quote ${q.quote_number}` : "Quote discussion"}
              label="Discuss"
            />
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1 size-4" /> Print / PDF
            </Button>
            {q.status === "draft" ? (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/sales/quotes/$quoteId/edit" params={{ quoteId }}>
                    Edit draft
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
                  Delete draft
                </Button>
              </>
            ) : null}
            {actions.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                disabled={statusM.isPending}
                onClick={() => statusM.mutate(s)}
              >
                {ACTION_LABEL[s]}
              </Button>
            ))}
            {canVoid ? (
              <Button size="sm" variant="outline" onClick={() => setVoidOpen(true)}>
                Void quote
              </Button>
            ) : null}
            {convertible.ok ? (
              <Button size="sm" disabled={convertM.isPending} onClick={() => convertM.mutate()}>
                {convertM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Convert to invoice
              </Button>
            ) : null}
            {q.converted_invoice_id ? (
              <Button size="sm" variant="outline" asChild>
                <Link
                  to="/sales/invoices/$invoiceId"
                  params={{ invoiceId: q.converted_invoice_id }}
                >
                  Open invoice
                </Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={copyM.isPending || !can("sales.draft")}
              title={
                can("sales.draft")
                  ? "Create a new draft quote dated today"
                  : "You do not have permission to create drafts"
              }
              onClick={() => copyM.mutate()}
            >
              {copyM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Copy quote
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <StatusBadge status={q.status} />
          <span>#{q.quote_number ?? "—"}</span>
          <span>Total {money(q.total_minor, cur)}</span>
          {q.sent_at ? <span>Sent {q.sent_at.slice(0, 10)}</span> : null}
          {q.accepted_at ? <span>Accepted {q.accepted_at.slice(0, 10)}</span> : null}
        </div>
        {!convertible.ok && !q.converted_invoice_id && q.status !== "void" ? (
          <p className="mb-4 text-sm text-muted-foreground">{convertible.reason}</p>
        ) : null}
        {q.price_list_name_snapshot ? (
          <p className="mb-3 text-sm text-muted-foreground print:hidden">
            Selected sales price list at save: {q.price_list_name_snapshot}
          </p>
        ) : null}
        {q.memo ? <p className="mb-4 text-sm text-muted-foreground">{q.memo}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Tax %</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Tax</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  {l.description}
                  {l.pricing_snapshot?.source === "price_list" ? (
                    <p className="mt-1 text-xs text-muted-foreground print:hidden">
                      List pricing: {l.pricing_snapshot.basis.replace("_", " ")}
                      {l.pricing_snapshot.discount_bps
                        ? ` · ${(l.pricing_snapshot.discount_bps / 100).toFixed(2)}% rule`
                        : ""}
                      {" · "}priced {l.pricing_snapshot.pricing_date}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">{l.quantity}</TableCell>
                <TableCell className="text-right">{money(l.unit_price_minor, cur)}</TableCell>
                <TableCell className="text-right">{money(l.discount_minor, cur)}</TableCell>
                <TableCell className="text-right">{bpsToPercentString(l.tax_rate_bps)}%</TableCell>
                <TableCell className="text-right">{money(l.net_minor, cur)}</TableCell>
                <TableCell className="text-right">{money(l.tax_minor, cur)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
          <TotalsSummary
            aria-label="Quote totals"
            lines={[
              { id: "subtotal", label: "Subtotal", value: money(q.subtotal_minor, cur) },
              {
                id: "tax",
                label: "Tax",
                value: money(q.tax_minor, cur),
                emphasis: "muted",
              },
              {
                id: "total",
                label: "Total",
                value: money(q.total_minor, cur),
                emphasis: "total",
              },
            ]}
          />
        </div>
      </RecordWorkspace>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft quote?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft and its lines are removed. Nothing was posted to the ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteM.mutate()}>Delete draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              A void quote cannot be converted or reopened. It never affected the ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => statusM.mutate("void")}>Void quote</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DocumentActions kind="sales_quote" id={quoteId} />
      <DocumentRecordPanel entityType="sales_quote" entityId={quoteId} audience="customer" />
    </>
  );
}
