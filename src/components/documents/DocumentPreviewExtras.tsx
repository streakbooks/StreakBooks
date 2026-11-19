import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { listAttachments, getAttachmentDownload } from "@/lib/documents/attachments.functions";
import { formatFileSize } from "@/lib/documents/attachments";
import { downloadBase64 } from "@/lib/documents/upload-client";
import { openSignedDownload } from "@/lib/documents/ui";
import { getInvoice } from "@/lib/sales/sales.functions";
import { getBill } from "@/lib/purchases/purchases.functions";

type Kind = "sales_invoice" | "purchase_bill";
type DetailLine = {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  netMinor: number;
  taxMinor: number;
};

/**
 * Reuses the already authorised invoice/bill GET endpoints and attachment policies.
 * Neither the preview nor the download controls can edit, post or approve documents.
 */
export function DocumentPreviewExtras({
  companyId,
  documentId,
  kind,
  currency,
  money,
}: {
  companyId: string;
  documentId: string;
  kind: Kind;
  currency: string;
  money: (minor: number, code: string) => string;
}) {
  const fetchInvoice = useServerFn(getInvoice);
  const fetchBill = useServerFn(getBill);
  const fetchAttachments = useServerFn(listAttachments);
  const fetchDownload = useServerFn(getAttachmentDownload);

  const invoiceQ = useQuery({
    queryKey: ["quick-preview-lines", companyId, kind, documentId],
    enabled: kind === "sales_invoice" && Boolean(companyId && documentId),
    queryFn: () => fetchInvoice({ data: { companyId, invoiceId: documentId } }),
    staleTime: 20_000,
  });
  const billQ = useQuery({
    queryKey: ["quick-preview-bill-lines", companyId, documentId],
    enabled: kind === "purchase_bill" && Boolean(companyId && documentId),
    queryFn: () => fetchBill({ data: { companyId, billId: documentId } }),
    staleTime: 20_000,
  });
  const attachmentsQ = useQuery({
    queryKey: ["attachments", companyId, kind, documentId],
    enabled: Boolean(companyId && documentId),
    queryFn: () =>
      fetchAttachments({ data: { companyId, entityType: kind, entityId: documentId } }),
    staleTime: 20_000,
  });

  const download = useMutation({
    mutationFn: (attachmentId: string) => fetchDownload({ data: { companyId, attachmentId } }),
    onSuccess: (result) => {
      if (result.kind === "url") openSignedDownload(result.url, result.fileName);
      else downloadBase64(result.fileName, result.contentType, result.contentBase64);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const lines: DetailLine[] =
    kind === "sales_invoice"
      ? (invoiceQ.data?.sales_invoice_lines ?? []).map((line) => ({
          id: line.id,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: line.unit_price_minor,
          netMinor: line.net_minor,
          taxMinor: line.tax_minor,
        }))
      : (billQ.data?.purchase_bill_lines ?? []).map((line) => ({
          id: line.id,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: line.unit_price_minor,
          netMinor: line.net_minor,
          taxMinor: line.tax_minor,
        }));
  const detailQ = kind === "sales_invoice" ? invoiceQ : billQ;
  const attachments = attachmentsQ.data ?? [];

  return (
    <div className="space-y-5 border-t pt-5" aria-label="Document detail preview">
      <section aria-label="Line items" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Line items</h3>
          {!detailQ.isPending && !detailQ.isError ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {lines.length} {lines.length === 1 ? "line" : "lines"}
            </span>
          ) : null}
        </div>
        {detailQ.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading line items…
          </p>
        ) : detailQ.isError ? (
          <QueryErrorState queries={[detailQ]} title="Could not load document line items" />
        ) : lines.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No line items were recorded.
          </p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {lines.map((line, index) => (
              <div key={line.id} className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="break-words font-medium">
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {line.description || "Untitled item"}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground tabular-nums">
                    {line.quantity} × {money(line.unitPriceMinor, currency)}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {money(line.netMinor, currency)}
                  </span>
                </div>
                {line.taxMinor ? (
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Tax: {money(line.taxMinor, currency)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
      <section aria-label="Document attachments" className="space-y-2">
        <div className="flex items-center gap-2">
          <Paperclip className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">Attachments</h3>
          {!attachmentsQ.isPending && !attachmentsQ.isError ? (
            <span className="text-xs text-muted-foreground">({attachments.length})</span>
          ) : null}
        </div>
        {attachmentsQ.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading attachments…
          </p>
        ) : attachmentsQ.isError ? (
          <QueryErrorState queries={[attachmentsQ]} title="Could not load attachments" />
        ) : attachments.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No attachments linked to this document.
          </p>
        ) : (
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center gap-2 rounded-lg border p-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={attachment.file_name}>
                    {attachment.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {attachment.size_bytes !== null
                      ? formatFileSize(attachment.size_bytes)
                      : "File"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={download.isPending}
                  onClick={() => download.mutate(attachment.id)}
                  aria-label={"Download " + attachment.file_name}
                >
                  {download.isPending && download.variables === attachment.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="size-4" aria-hidden />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
