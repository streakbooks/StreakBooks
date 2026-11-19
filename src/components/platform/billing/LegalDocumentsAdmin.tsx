import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  LEGAL_DOCUMENT_KINDS,
  actOnLegalDocument,
  draftLegalDocument,
  getLegalDocumentsAdmin,
  type LegalDocument,
} from "@/lib/billing/legal-documents.functions";

const queryKey = ["platform-legal-documents"] as const;

function kindLabel(kind: string): string {
  return kind
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error || typeof error === "string" ? friendlyAuthError(error) : fallback;
}

export function LegalDocumentsAdmin({ canEdit, isOwner }: { canEdit: boolean; isOwner: boolean }) {
  const load = useServerFn(getLegalDocumentsAdmin);
  const query = useQuery({ queryKey, queryFn: () => load(), retry: false });
  return (
    <section className="space-y-4" aria-labelledby="legal-heading">
      <header className="space-y-1">
        <h2 id="legal-heading" className="text-xl font-semibold">
          Legal documents
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Text is written and reviewed by people. A draft stays marked for legal review until
          another platform owner approves it. Approved text cannot change; publish a new version
          instead. Customers see only the published version.
        </p>
      </header>
      {query.isLoading ? <p className="text-sm">Loading documents…</p> : null}
      {query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load legal documents" />
      ) : null}
      {query.data ? (
        <DocumentList documents={query.data} canEdit={canEdit} isOwner={isOwner} />
      ) : null}
      {canEdit ? <DraftForm /> : null}
    </section>
  );
}

function DocumentList({
  documents,
  canEdit,
  isOwner,
}: {
  documents: LegalDocument[];
  canEdit: boolean;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const act = useServerFn(actOnLegalDocument);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: (input: { id: string; action: "approve" | "publish" | "retire" }) =>
      act({ data: { ...input, reason } }),
    onSuccess: (_result, input) => {
      toast.success(
        input.action === "approve"
          ? "Approved."
          : input.action === "publish"
            ? "Published. Customers now see this version."
            : "Retired.",
      );
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorText(error, "The document could not be updated.")),
  });
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents yet.</p>;
  }
  return (
    <div className="space-y-3">
      {canEdit ? (
        <label className="block max-w-md text-sm">
          Reason for the next action
          <Input
            className="mt-1"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      ) : null}
      <ul className="space-y-2">
        {documents.map((doc) => (
          <li key={doc.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {kindLabel(doc.kind)} · v{doc.version} · {doc.locale}
              </span>
              <Badge variant={doc.status === "published" ? "success" : "secondary"}>
                {doc.status}
              </Badge>
              {doc.requiresLegalReview ? <Badge variant="warning">Needs legal review</Badge> : null}
              <span className="text-muted-foreground">{doc.title}</span>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground">Show text</summary>
              <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3">
                {doc.body}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">SHA-256 {doc.bodySha256}</p>
            </details>
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {isOwner && doc.status === "draft" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending || reason.trim().length < 3}
                    onClick={() => mutation.mutate({ id: doc.id, action: "approve" })}
                  >
                    Approve after legal review
                  </Button>
                ) : null}
                {isOwner && doc.status === "approved" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending || reason.trim().length < 3}
                    onClick={() => mutation.mutate({ id: doc.id, action: "publish" })}
                  >
                    Publish
                  </Button>
                ) : null}
                {doc.status !== "retired" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={mutation.isPending || reason.trim().length < 3}
                    onClick={() => mutation.mutate({ id: doc.id, action: "retire" })}
                  >
                    Retire
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraftForm() {
  const queryClient = useQueryClient();
  const draft = useServerFn(draftLegalDocument);
  const [kind, setKind] = useState<(typeof LEGAL_DOCUMENT_KINDS)[number]>("CANCELLATION_POLICY");
  const [locale, setLocale] = useState("en");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => draft({ data: { kind, locale, title, body, reason } }),
    onSuccess: (doc) => {
      toast.success(`Draft v${doc.version} saved. Another platform owner approves it.`);
      setTitle("");
      setBody("");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorText(error, "The draft could not be saved.")),
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <h3 className="font-medium sm:col-span-3">New version</h3>
      <label className="text-sm">
        Document
        <select
          className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
          value={kind}
          onChange={(event) => setKind(event.target.value as (typeof LEGAL_DOCUMENT_KINDS)[number])}
        >
          {/* lookup-fixed-enum: Legal document type is a fixed schema enumeration. */}
          {LEGAL_DOCUMENT_KINDS.map((item) => (
            <option key={item} value={item}>
              {kindLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Language
        <Input
          className="mt-1"
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
        />
      </label>
      <label className="text-sm">
        Title
        <Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="text-sm sm:col-span-3">
        Text
        <Textarea
          className="mt-1 min-h-40"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <label className="text-sm sm:col-span-2">
        Reason
        <Input
          className="mt-1"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <Button type="submit" className="self-end sm:w-fit" disabled={mutation.isPending}>
        Save draft
      </Button>
    </form>
  );
}
