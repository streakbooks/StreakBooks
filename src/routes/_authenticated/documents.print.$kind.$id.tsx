import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { getPrintableDocument } from "@/lib/documents/documents.functions";
import { DOCUMENT_KIND_LABEL, isDocumentKind } from "@/lib/documents/types";
import { documentFileName } from "@/lib/documents/helpers";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { EmptyState, LoadingState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/documents/print/$kind/$id")({
  head: () => ({ meta: [{ title: "Print document — LinkBooks" }] }),
  component: PrintDocumentPage,
});

function PrintDocumentPage() {
  const { kind, id } = Route.useParams();
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const fetchDoc = useServerFn(getPrintableDocument);
  const validKind = isDocumentKind(kind);

  const query = useQuery({
    queryKey: ["printable-document", companyId, kind, id],
    enabled: Boolean(companyId) && validKind,
    queryFn: () => fetchDoc({ data: { companyId: companyId!, kind, id } }),
  });

  // The browser proposes the page title as the PDF file name.
  const fileName = query.data
    ? documentFileName(
        DOCUMENT_KIND_LABEL[query.data.document.kind],
        query.data.document.number,
        id,
      )
    : null;
  useEffect(() => {
    if (!fileName) return;
    const previous = document.title;
    document.title = fileName;
    return () => {
      document.title = previous;
    };
  }, [fileName]);

  if (!validKind)
    return (
      <EmptyState title="Unknown document" description="This document type cannot be printed." />
    );
  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return <QueryErrorState queries={[query]} title="Could not load the document" />;
  }

  const { document: doc, branding, locale, dateFormat } = query.data;
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[820px] flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="mr-1 size-4" /> Back to{" "}
          {DOCUMENT_KIND_LABEL[doc.kind].toLowerCase()}
        </Button>
        <div className="flex items-center gap-3">
          {query.data.appearanceProvenance === "legacy_baseline" && (
            <p className="text-xs text-muted-foreground">
              Appearance preserved from the branding rollout; earlier designs cannot be
              reconstructed.
            </p>
          )}
          <p className="hidden text-xs text-muted-foreground sm:block">
            In the print window choose “Save as PDF” as the destination to download a PDF.
          </p>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 size-4" /> Print / Save as PDF
          </Button>
        </div>
      </div>
      <DocumentSheet document={doc} branding={branding} locale={locale} dateFormat={dateFormat} />
    </>
  );
}
