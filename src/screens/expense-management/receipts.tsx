import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  FILE_INPUT_ACCEPT,
  formatFileSize,
  MAX_FILE_BYTES,
  validateUpload,
} from "@/lib/documents/attachments";
import {
  getAttachmentDownload,
  registerAttachment,
} from "@/lib/documents/attachments.functions";
import { uploadCompanyDocument } from "@/lib/documents/upload-client";
import {
  dismissExpenseReceiptInboxEntry,
  EXPENSE_RECEIPT_MIGRATION,
  EXPENSE_RISK_MIGRATION,
  finalizeExpenseReceiptInboxUpload,
  listExpenseClaims,
  listExpenseReceiptInbox,
  matchExpenseReceiptToClaim,
  registerExpenseReceiptInboxEntry,
  requestExpenseReceiptOcr,
} from "@/lib/expenses/expenses.functions";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementReceiptsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canOpen =
    can("expenses.submit" as Permission) ||
    can("expenses.view" as Permission) ||
    can("expenses.approve" as Permission) ||
    can("expenses.admin" as Permission);
  const canSubmit = can("expenses.submit" as Permission);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [matchClaimByEntry, setMatchClaimByEntry] = useState<Record<string, string>>({});

  const fetchInbox = useServerFn(listExpenseReceiptInbox);
  const fetchClaims = useServerFn(listExpenseClaims);
  const registerEntry = useServerFn(registerExpenseReceiptInboxEntry);
  const finalizeUpload = useServerFn(finalizeExpenseReceiptInboxUpload);
  const matchEntry = useServerFn(matchExpenseReceiptToClaim);
  const dismissEntry = useServerFn(dismissExpenseReceiptInboxEntry);
  const requestOcr = useServerFn(requestExpenseReceiptOcr);
  const registerFile = useServerFn(registerAttachment);
  const downloadAttachment = useServerFn(getAttachmentDownload);

  const inboxQ = useQuery({
    queryKey: ["expense-receipt-inbox", company?.id],
    queryFn: () => fetchInbox({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen,
    retry: false,
  });

  const claimsQ = useQuery({
    queryKey: ["expense-claims", company?.id, "receipt-match"],
    queryFn: () => fetchClaims({ data: { companyId: company!.id, scope: "own" } }),
    enabled: Boolean(company?.id) && canSubmit,
    retry: false,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["expense-receipt-inbox", company?.id] });
  };

  const upload = useMutation({
    mutationFn: async (source: "upload" | "mobile") => {
      if (!company) throw new Error("Select a company first.");
      if (!file) throw new Error("Choose a receipt file.");
      const check = validateUpload({
        fileName: file.name,
        sizeBytes: file.size,
        contentType: file.type,
      });
      if (!check.ok) throw new Error(check.error);

      const entry = await registerEntry({
        data: {
          companyId: company.id,
          fileName: file.name,
          source,
          ...(file.type ? { contentType: file.type } : {}),
          sizeBytes: file.size,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });

      const attached = await uploadCompanyDocument({
        file,
        companyId: company.id,
        entityType: "expense_receipt_inbox",
        entityId: entry.id,
        register: registerFile as never,
      });

      return finalizeUpload({
        data: {
          companyId: company.id,
          entryId: entry.id,
          attachmentId: attached.id,
        },
      });
    },
    onSuccess: () => {
      setFile(null);
      setNotes("");
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
      invalidate();
      toast.success("Receipt uploaded to the inbox.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const match = useMutation({
    mutationFn: async (entryId: string) => {
      if (!company) throw new Error("Select a company first.");
      const claimId = matchClaimByEntry[entryId];
      if (!claimId) throw new Error("Choose a draft claim to match.");
      const entry = inboxQ.data?.entries.find((item) => item.id === entryId);
      if (!entry) throw new Error("Inbox entry not found.");

      const matched = await matchEntry({
        data: { companyId: company.id, entryId, claimId },
      });

      if (entry.attachmentId) {
        const download = await downloadAttachment({
          data: { companyId: company.id, attachmentId: entry.attachmentId },
        });
        let blob: Blob;
        let fileName = entry.fileName;
        if (download.kind === "url") {
          const response = await fetch(download.url);
          if (!response.ok) throw new Error("Could not download the receipt for claim linking.");
          blob = await response.blob();
          fileName = download.fileName || fileName;
        } else {
          const binary = atob(download.contentBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          blob = new Blob([bytes], { type: download.contentType || "application/octet-stream" });
          fileName = download.fileName || fileName;
        }
        const claimFile = new File([blob], fileName, {
          type: entry.contentType || blob.type || "application/octet-stream",
        });
        await uploadCompanyDocument({
          file: claimFile,
          companyId: company.id,
          entityType: "expense_claim",
          entityId: claimId,
          register: registerFile as never,
        });
      }

      return matched;
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });
      toast.success("Receipt matched and linked to the claim.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const dismiss = useMutation({
    mutationFn: async (entryId: string) => {
      if (!company) throw new Error("Select a company first.");
      return dismissEntry({ data: { companyId: company.id, entryId } });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Receipt dismissed.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const ocr = useMutation({
    mutationFn: async (entryId: string) => {
      if (!company) throw new Error("Select a company first.");
      return requestOcr({ data: { companyId: company.id, entryId } });
    },
    onSuccess: () => {
      invalidate();
      toast.message("OCR unavailable", {
        description: "No OCR provider is configured yet. Entry marked unavailable.",
      });
    },
    onError: (error) => {
      const message = friendlyAuthError(error);
      toast.error(message.includes("20261107146000") ? EXPENSE_RISK_MIGRATION : message);
    },
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canOpen) {
    return (
      <ListWorkspace title="Receipts & Inbox"
      subnav={<ExpenseManagementSubnav current="receipts"/>}
    >
      <EmptyState
          title="No access"
          description="Ask an administrator for expenses.submit or expenses.view."
        />
    </ListWorkspace>
    );
  }
  if (inboxQ.isLoading) {
    return (
      <ListWorkspace title="Receipts & Inbox" description="Expenses"
      subnav={<ExpenseManagementSubnav current="receipts"/>}
    >
      <LoadingState />
    </ListWorkspace>
    );
  }
  if (inboxQ.isError) {
    const message = friendlyAuthError(inboxQ.error);
    return (
      <ListWorkspace title="Receipts & Inbox"
      subnav={<ExpenseManagementSubnav current="receipts"/>}
    >
      {message.includes("2026110713") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_RECEIPT_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <ErrorState
            title="Could not load receipt inbox"
            description={message}
            onRetry={() => inboxQ.refetch()}
          />
        )}
    </ListWorkspace>
    );
  }

  const inbox = inboxQ.data;
  if (!inbox) {
    return (
      <ListWorkspace title="Receipts & Inbox"
      subnav={<ExpenseManagementSubnav current="receipts"/>}
    >
      <LoadingState />
    </ListWorkspace>
    );
  }
  const draftClaims = (claimsQ.data ?? []).filter(
    (claim) =>
      claim.approvalStatus === "draft" ||
      claim.approvalStatus === "submitted" ||
      claim.approvalStatus === "returned",
  );

  const chooseFile = (next: File | null) => {
    if (!next) {
      setFile(null);
      return;
    }
    const check = validateUpload({
      fileName: next.name,
      sizeBytes: next.size,
      contentType: next.type,
    });
    if (!check.ok) {
      toast.error(check.error);
      setFile(null);
      return;
    }
    setFile(next);
  };

  return (
    <ListWorkspace
      title="Receipts & Inbox"
      description="Upload receipts, then match them to a claim. Email OCR is not configured."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/expense-management/$section" params={{ section: "my-expenses" }}>Open My Expenses</Link>
        </Button>
      }
      subnav={<ExpenseManagementSubnav current="receipts" />}
    >
      <Alert className="mb-6">
        <AlertTitle>
          {inbox.inboundEmailEnabled ? "Inbound email enabled" : "Inbound email not configured"}
          {" · "}
          {inbox.ocrEnabled ? "OCR enabled" : "OCR not configured"}
        </AlertTitle>
        <AlertDescription>{inbox.note}</AlertDescription>
      </Alert>

      {canSubmit ? (
        <form
          className="mb-8 grid max-w-xl gap-3 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            upload.mutate("upload");
          }}
        >
          <h2 className="text-base font-semibold">Upload receipt</h2>
          <p className="text-sm text-muted-foreground">
            Files are private to this organisation. Malware scanning and OCR are not run. Up to{" "}
            {formatFileSize(MAX_FILE_BYTES)} per file.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="em-receipt-file">File</Label>
            <Input
              id="em-receipt-file"
              ref={fileRef}
              type="file"
              accept={FILE_INPUT_ACCEPT}
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="em-receipt-camera">Camera / mobile capture</Label>
            <Input
              id="em-receipt-camera"
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="em-receipt-notes">Notes</Label>
            <Input
              id="em-receipt-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={upload.isPending || !file}>
              {upload.isPending ? "Uploading…" : "Upload to inbox"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={upload.isPending || !file}
              onClick={() => upload.mutate("mobile")}
            >
              Save as mobile capture
            </Button>
          </div>
        </form>
      ) : null}

      {inbox.entries.length === 0 ? (
        <EmptyState
          title="No open receipts"
          description="Upload a receipt above, or attach files directly on a claim detail page."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>OCR</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inbox.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">
                  <div>{entry.fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry.attachmentId ? "File stored" : "Metadata only"}
                    {entry.sizeBytes != null ? ` · ${formatFileSize(entry.sizeBytes)}` : ""}
                  </div>
                </TableCell>
                <TableCell>{entry.source}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{entry.status}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{entry.ocrStatus}</Badge>
                </TableCell>
                <TableCell>{entry.createdAt.slice(0, 10) || "—"}</TableCell>
                <TableCell className="text-right">
                  {canSubmit ? (
                    <div className="flex flex-col items-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={ocr.isPending}
                        onClick={() => ocr.mutate(entry.id)}
                      >
                        Request OCR
                      </Button>
                      <Select
                        value={matchClaimByEntry[entry.id] ?? ""}
                        onValueChange={(value) =>
                          setMatchClaimByEntry((current) => ({ ...current, [entry.id]: value }))
                        }
                      >
                        <SelectTrigger className="w-[220px]" aria-label={`Match claim for ${entry.fileName}`}>
                          <SelectValue placeholder="Select claim" />
                        </SelectTrigger>
                        <SelectContent>
                          {draftClaims.map((claim) => (
                            <SelectItem key={claim.id} value={claim.id}>
                              {claim.claimNumber || "Draft"} · {claim.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={match.isPending || !matchClaimByEntry[entry.id]}
                          onClick={() => match.mutate(entry.id)}
                        >
                          Match
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={dismiss.isPending}
                          onClick={() => dismiss.mutate(entry.id)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListWorkspace>
  );
}
