import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { recordCashClassificationException } from "@/lib/accounting/cash-classification.functions";
import type { CashClassificationException } from "@/lib/reports/cash-classification";
import { fromMinorUnits } from "@/lib/accounting/money";
import { Button } from "@/components/ui/button";

/** Explicit review action; report reads never approve or fabricate a classification. */
export function CashClassificationErrorState({
  exceptions,
  onRetry,
}: {
  exceptions: CashClassificationException[];
  onRetry?: (() => void) | undefined;
}) {
  const record = useServerFn(recordCashClassificationException);
  const mutation = useMutation({
    mutationFn: async () => {
      for (const exception of exceptions)
        await record({ data: { companyId: exception.companyId, exception } });
    },
  });
  return (
    <div
      role="alert"
      className="space-y-4 rounded-lg border border-destructive/30 bg-destructive-soft p-6"
    >
      <h3 className="font-semibold">Cash classification needs review</h3>
      <p className="text-sm">
        Supporting evidence is required before these amounts can appear in the cash report.
      </p>
      <ul className="space-y-3">
        {exceptions.map((item, index) => (
          <li key={index} className="rounded border p-3 text-sm">
            <p>{item.message}</p>
            <p className="font-mono">
              {fromMinorUnits(BigInt(item.amountMinor), item.currency)} {item.currency} ·{" "}
              {item.period.from} to {item.period.to}
            </p>
            {item.journalId && (
              <Link
                className="underline"
                to="/accounting"
                search={{ tab: "journals", journal: item.journalId }}
              >
                Inspect source journal
              </Link>
            )}
            {item.documentId && <p className="break-all">Document: {item.documentId}</p>}
            <ul>
              {item.missingEvidence.map((missing, i) => (
                <li key={i}>{missing}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={mutation.isPending || mutation.isSuccess}
          onClick={() => mutation.mutate()}
        >
          {mutation.isSuccess
            ? "Recorded for review"
            : mutation.isPending
              ? "Recording…"
              : "Record for review"}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/accounting" search={{ tab: "cash-classification" }}>
            Review classifications
          </Link>
        </Button>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Refresh report
          </Button>
        )}
      </div>
      {mutation.isError && (
        <p className="text-sm text-destructive">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Could not record the exception"}
        </p>
      )}
    </div>
  );
}
