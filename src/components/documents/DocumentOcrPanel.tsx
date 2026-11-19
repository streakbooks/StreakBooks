import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileScan, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  checkDocumentOcr,
  getDocumentOcrAvailability,
  startDocumentOcr,
} from "@/lib/documents/ocr.functions";
import type { OcrSuggestions } from "@/lib/documents/ocr-model";

type Result =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | {
      status: "completed";
      suggestions: OcrSuggestions;
      confidence: Record<string, number>;
      warnings: string[];
    };

const TITLES: Array<[keyof OcrSuggestions, string]> = [
  ["documentType", "Type"],
  ["supplierName", "Supplier"],
  ["reference", "Reference"],
  ["documentDate", "Document date"],
  ["currencyCode", "Currency"],
  ["totalMinor", "Amount in minor units"],
];

/** OCR suggestions are advisory and are not saved until the user saves the review form. */
export function DocumentOcrPanel({
  companyId,
  attachmentId,
  onApply,
}: {
  companyId: string;
  attachmentId: string;
  onApply: (suggestions: OcrSuggestions) => void;
}) {
  const availabilityFn = useServerFn(getDocumentOcrAvailability);
  const startFn = useServerFn(startDocumentOcr);
  const checkFn = useServerFn(checkDocumentOcr);
  const [confirmed, setConfirmed] = useState(false);
  const [jobToken, setJobToken] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const liveScope = useRef(`${companyId}:${attachmentId}`);
  liveScope.current = `${companyId}:${attachmentId}`;

  useEffect(() => {
    setConfirmed(false);
    setJobToken(null);
    setResult(null);
  }, [companyId, attachmentId]);

  const available = useQuery({
    queryKey: ["document-ocr-availability", companyId],
    queryFn: () => availabilityFn({ data: { companyId } }),
    retry: false,
  });
  const start = useMutation({
    mutationFn: (input: { companyId: string; attachmentId: string; consent: boolean }) =>
      startFn({ data: input }),
    onSuccess: (value, input) => {
      if (liveScope.current !== `${input.companyId}:${input.attachmentId}`) return;
      setJobToken(value.jobToken);
      setResult({ status: "pending" });
      toast.success("Extraction requested. Select Check OCR result when ready.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const check = useMutation({
    mutationFn: (input: { companyId: string; attachmentId: string; jobToken: string }) =>
      checkFn({ data: input }),
    onSuccess: (value, input) => {
      if (liveScope.current !== `${input.companyId}:${input.attachmentId}`) return;
      setResult(value);
      if (value.status === "pending") toast.info("OCR is still processing. Check again shortly.");
      else if (value.status === "failed") toast.error(friendlyAuthError(value.message));
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  return (
    <section aria-label="Document OCR suggestions" className="space-y-3 rounded-lg border p-3">
      <div>
        <h4 className="flex items-center gap-2 font-semibold">
          <FileScan className="size-4" /> OCR and invoice field suggestions
        </h4>
        <p className="text-xs text-muted-foreground">
          An optional third-party extraction for PDF, PNG and JPEG documents up to 8 MB. Only the
          first three pages are analysed. Nothing is posted or approved automatically.
        </p>
      </div>
      {available.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking OCR configuration…
        </p>
      ) : available.isError ? (
        <QueryErrorState queries={[available]} title="Could not check OCR configuration" />
      ) : !available.data?.configured ? (
        <p role="status" className="text-sm text-muted-foreground">
          OCR is not configured. Administrator setup needed:{" "}
          {available.data?.missing.join(", ") || "Ask your administrator."}.
        </p>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={start.isPending || Boolean(jobToken)}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1"
            />
            I understand this document will be sent securely to the configured Azure Document
            Intelligence service for extraction.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              type="button"
              disabled={!confirmed || start.isPending || Boolean(jobToken)}
              onClick={() => start.mutate({ companyId, attachmentId, consent: confirmed })}
            >
              {start.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <FileScan className="mr-1 size-4" />
              )}
              Start extraction
            </Button>
            {jobToken ? (
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={check.isPending}
                onClick={() => check.mutate({ companyId, attachmentId, jobToken })}
              >
                {check.isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 size-4" />
                )}
                Check OCR result
              </Button>
            ) : null}
            {jobToken ? (
              <Button
                size="sm"
                type="button"
                variant="ghost"
                disabled={check.isPending || start.isPending}
                onClick={() => {
                  setJobToken(null);
                  setResult(null);
                  setConfirmed(false);
                }}
              >
                Start new extraction
              </Button>
            ) : null}
          </div>
          {result?.status === "pending" ? (
            <p role="status" className="text-xs text-muted-foreground">
              The provider has accepted the file. Check the result again once processing finishes.
            </p>
          ) : result?.status === "failed" ? (
            <p role="alert" className="text-xs text-destructive">
              {friendlyAuthError(result.message)}
            </p>
          ) : result?.status === "completed" ? (
            <div className="space-y-3">
              <div className="space-y-1 text-xs">
                {TITLES.map(([key, title]) => {
                  const value = result.suggestions[key];
                  if (value == null) return null;
                  return (
                    <p key={key}>
                      <strong>{title}:</strong> {String(value)}
                      {result.confidence[key] != null
                        ? ` · ${Math.round(result.confidence[key] * 100)}% model confidence`
                        : ""}
                    </p>
                  );
                })}
              </div>
              {result.warnings.map((warning) => (
                <p className="text-xs text-amber-700 dark:text-amber-400" key={warning}>
                  {warning}
                </p>
              ))}
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => onApply(result.suggestions)}
              >
                Fill blank review fields
              </Button>
              <p className="text-xs text-muted-foreground">
                Suggestions may be incorrect. Inspect the original, correct any fields, then select
                Save review. This action never saves automatically.
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
