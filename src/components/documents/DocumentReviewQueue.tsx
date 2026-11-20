import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { DocumentOcrPanel } from "@/components/documents/DocumentOcrPanel";
import { fillBlankReviewFields, type OcrSuggestions } from "@/lib/documents/ocr-model";
import { getAttachmentDownload, getAttachmentPreview } from "@/lib/documents/attachments.functions";
import { ATTACHMENT_ENTITIES, formatFileSize } from "@/lib/documents/attachments";
import { downloadBase64 } from "@/lib/documents/upload-client";
import { openSignedDownload } from "@/lib/documents/ui";
import {
  listDocumentReviewHistory,
  listDocumentReviewQueue,
  updateDocumentReview,
  type ReviewQueueItem,
} from "@/lib/documents/review.functions";
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  REVIEW_TYPES,
  REVIEW_TYPE_LABELS,
  canApproveDocument,
  type ReviewFields,
  type ReviewStatus,
  type ReviewType,
} from "@/lib/documents/review-model";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function fieldsFor(item: ReviewQueueItem): ReviewFields {
  return {
    status: item.status,
    documentType: item.document_type,
    reference: item.reference,
    supplierName: item.supplier_name,
    documentDate: item.document_date,
    currencyCode: item.currency_code,
    totalMinor: item.total_minor,
    note: item.note,
  };
}

/**
 * An actual, persisted, company-isolated manual triage queue. It does NOT OCR,
 * publish an accounting transaction, send email or call an unconfigured provider.
 */
export function DocumentReviewQueue({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const { can } = useCan();
  const canManage = ATTACHMENT_ENTITIES.company.manage.some((permission) => can(permission));
  const canApprove = canApproveDocument((permission) => can(permission));
  const client = useQueryClient();
  const loadQueue = useServerFn(listDocumentReviewQueue);
  const loadHistory = useServerFn(listDocumentReviewHistory);
  const saveReview = useServerFn(updateDocumentReview);
  const getPreview = useServerFn(getAttachmentPreview);
  const getDownload = useServerFn(getAttachmentDownload);

  const [status, setStatus] = useState<ReviewStatus | "all">("needs_review");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ReviewFields | null>(null);
  const [inlineUrl, setInlineUrl] = useState<string | null>(null);

  const queue = useQuery({
    queryKey: ["document-review-queue", companyId, status, page],
    queryFn: () =>
      loadQueue({
        data: { companyId, ...(status === "all" ? {} : { status }), page, pageSize: 25 },
      }),
  });
  const selected = queue.data?.rows.find((item) => item.id === selectedId) ?? null;
  useEffect(() => setEdit(selected ? fieldsFor(selected) : null), [selected]);

  const history = useQuery({
    queryKey: ["document-review-history", companyId, selected?.id],
    enabled: Boolean(selected),
    queryFn: () => loadHistory({ data: { companyId, reviewId: selected!.id } }),
  });
  const preview = useQuery({
    queryKey: ["document-review-preview", companyId, selected?.attachment_id],
    enabled: Boolean(selected),
    retry: false,
    queryFn: () => getPreview({ data: { companyId, attachmentId: selected!.attachment_id } }),
  });
  useEffect(() => {
    const result = preview.data;
    if (result?.kind !== "inline") {
      setInlineUrl(null);
      return;
    }
    const binary = atob(result.contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType }));
    setInlineUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview.data]);
  const previewUrl = preview.data?.kind === "url" ? preview.data.url : inlineUrl;

  const save = useMutation({
    mutationFn: () => {
      if (!selected || !edit) throw new Error("Select a document before saving");
      return saveReview({
        data: {
          companyId,
          attachmentId: selected.attachment_id,
          expectedVersion: selected.version,
          ...edit,
        },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["document-review-queue", companyId] }),
        client.invalidateQueries({ queryKey: ["document-review-history", companyId] }),
      ]);
      toast.success("Document review saved");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const download = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a document first");
      return getDownload({ data: { companyId, attachmentId: selected.attachment_id } });
    },
    onSuccess: (result) => {
      if (result.kind === "url") openSignedDownload(result.url, result.fileName);
      else downloadBase64(result.fileName, result.contentType, result.contentBase64);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const pages = Math.max(1, Math.ceil((queue.data?.total ?? 0) / 25));
  const update = (changes: Partial<ReviewFields>) =>
    setEdit((previous) => (previous ? { ...previous, ...changes } : null));
  const applyOcrSuggestions = (suggestions: OcrSuggestions) => {
    if (!canManage) return;
    setEdit((previous) => (previous ? fillBlankReviewFields(previous, suggestions) : null));
    toast.info("Suggestions filled only into blank fields. Verify and save the review manually.");
  };

  return (
    <section aria-label="Document review queue" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardCheck className="size-5" />
            Document review queue
          </h2>
          <p className="text-sm text-muted-foreground">
            Classify uploads, record details, and obtain review approval. Accounting entries are
            never created or posted here.
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          Back to Files
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as ReviewStatus | "all");
            setSelectedId(null);
            setPage(0);
          }}
        >
          {/* lookup-fixed-enum: Review status filter uses fixed lifecycle values. */}
          <SelectTrigger className="w-56" aria-label="Review status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All review states</SelectItem>
            {REVIEW_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {REVIEW_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {queue.data?.total ?? 0} matching documents
        </span>
      </div>
      {queue.isError ? (
        <QueryErrorState queries={[queue]} title="Could not load document review queue" />
      ) : queue.isPending ? (
        <p className="text-sm text-muted-foreground">Loading review queue…</p>
      ) : !queue.isSuccess ? (
        <p className="text-sm text-muted-foreground">Loading review queue…</p>
      ) : queue.data.rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No documents match this review state. Upload files through Files to add them here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="p-3">File</th>
                <th className="p-3">Type</th>
                <th className="p-3">Review status</th>
                <th className="p-3">Size</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {queue.data.rows.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="max-w-64 truncate p-3" title={item.file_name}>
                    {item.file_name}
                  </td>
                  <td className="p-3">{REVIEW_TYPE_LABELS[item.document_type]}</td>
                  <td className="p-3">
                    <StatusBadge status={item.status} label={REVIEW_STATUS_LABELS[item.status]} />
                  </td>
                  <td className="p-3">{formatFileSize(item.size_bytes)}</td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant={item.id === selectedId ? "default" : "outline"}
                      onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                    >
                      {item.id === selectedId ? "Close" : "Open review"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-end gap-3 text-sm">
        <Button
          size="sm"
          variant="outline"
          disabled={page === 0}
          onClick={() => {
            setPage((previous) => Math.max(0, previous - 1));
            setSelectedId(null);
          }}
        >
          Previous
        </Button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page + 1 >= pages}
          onClick={() => {
            setPage((previous) => previous + 1);
            setSelectedId(null);
          }}
        >
          Next
        </Button>
      </div>
      {selected && edit ? (
        <div className="grid gap-4 rounded-lg border p-4 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-semibold">{selected.file_name}</h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={download.isPending}
                onClick={() => download.mutate()}
              >
                <Download className="mr-1 size-4" />
                Download original
              </Button>
            </div>
            {preview.isPending ? (
              <p className="text-sm">Loading private preview…</p>
            ) : preview.isError ? (
              <QueryErrorState queries={[preview]} title="Could not load document preview" />
            ) : preview.data?.kind === "unsupported" ? (
              <p className="text-sm text-muted-foreground">
                This file format cannot be previewed. Download the original file.
              </p>
            ) : previewUrl ? (
              (preview.data?.kind === "url" || preview.data?.kind === "inline") &&
              preview.data.previewType === "image" ? (
                <img
                  src={previewUrl}
                  alt={`Preview of ${selected.file_name}`}
                  className="max-h-[28rem] max-w-full rounded border object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title={`Preview of ${selected.file_name}`}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  className="h-[28rem] w-full rounded border bg-white"
                />
              )
            ) : null}
            <h4 className="font-semibold">Review history</h4>
            {history.isError ? (
              <QueryErrorState queries={[history]} title="Could not load review history" />
            ) : history.data?.length ? (
              <ol className="space-y-2 border-l border-border/70 pl-4 text-xs">
                {history.data.map((event) => (
                  <li
                    key={event.id}
                    className="relative rounded-lg border border-border/70 bg-card p-3"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute -left-[1.4rem] top-4 size-2 rounded-full bg-primary"
                    />
                    <time className="block text-muted-foreground" dateTime={event.created_at}>
                      {new Date(event.created_at).toLocaleString()}
                    </time>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {event.old_status ? (
                        <StatusBadge status={event.old_status} />
                      ) : (
                        <span className="text-muted-foreground">New</span>
                      )}
                      <span aria-label="changed to" className="text-muted-foreground">
                        →
                      </span>
                      <StatusBadge status={event.new_status} />
                      <span className="text-muted-foreground">· {event.new_type}</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">No history yet.</p>
            )}
          </div>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            {canManage && (selected.status === "needs_review" || selected.status === "ready") ? (
              <DocumentOcrPanel
                companyId={companyId}
                attachmentId={selected.attachment_id}
                onApply={applyOcrSuggestions}
              />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="review-type">Document type</Label>
                <Select
                  value={edit.documentType}
                  disabled={!canManage}
                  onValueChange={(value) => update({ documentType: value as ReviewType })}
                >
                  {/* lookup-fixed-enum: Document types are a fixed classifier enumeration. */}
                  <SelectTrigger id="review-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {REVIEW_TYPE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="review-status">Review status</Label>
                <Select
                  value={edit.status}
                  disabled={!canManage || (selected.status === "approved" && !canApprove)}
                  onValueChange={(value) => update({ status: value as ReviewStatus })}
                >
                  {/* lookup-fixed-enum: Review status uses fixed lifecycle values. */}
                  <SelectTrigger id="review-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_STATUSES.map((option) => (
                      <SelectItem
                        key={option}
                        value={option}
                        disabled={
                          option === "approved" && (!canApprove || selected.status !== "ready")
                        }
                      >
                        {REVIEW_STATUS_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="review-supplier">Supplier or customer</Label>
                <Input
                  id="review-supplier"
                  value={edit.supplierName ?? ""}
                  maxLength={160}
                  disabled={!canManage}
                  onChange={(event) => update({ supplierName: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="review-reference">Document reference</Label>
                <Input
                  id="review-reference"
                  value={edit.reference ?? ""}
                  maxLength={120}
                  disabled={!canManage}
                  onChange={(event) => update({ reference: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="review-date">Document date</Label>
                <Input
                  id="review-date"
                  type="date"
                  value={edit.documentDate ?? ""}
                  disabled={!canManage}
                  onChange={(event) => update({ documentDate: event.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="review-currency">Currency</Label>
                <Input
                  id="review-currency"
                  value={edit.currencyCode ?? ""}
                  maxLength={3}
                  disabled={!canManage}
                  placeholder="USD"
                  onChange={(event) => update({ currencyCode: event.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="review-amount">Total in minor units (for example, cents)</Label>
                <Input
                  id="review-amount"
                  type="number"
                  min={0}
                  step={1}
                  value={edit.totalMinor ?? ""}
                  disabled={!canManage}
                  onChange={(event) =>
                    update({
                      totalMinor: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Informational only. This amount never creates or changes a journal entry.
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="review-note">Internal review note</Label>
              <Textarea
                id="review-note"
                value={edit.note ?? ""}
                maxLength={3000}
                disabled={!canManage}
                onChange={(event) => update({ note: event.target.value })}
              />
            </div>
            <Button
              type="submit"
              disabled={
                !canManage || save.isPending || (selected.status === "approved" && !canApprove)
              }
            >
              {save.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              Save review
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
