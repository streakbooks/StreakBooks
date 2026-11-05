import { Link } from "@tanstack/react-router";
import {
  CASH_CLASSIFICATION_EXCEPTION_PREFIX,
  type CashClassificationException,
} from "@/lib/reports/cash-classification";
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
        <Button variant="outline" asChild>
          <Link
            to="/accounting"
            search={{
              tab: "cash-classification",
              cashReview: CASH_CLASSIFICATION_EXCEPTION_PREFIX + JSON.stringify({ exceptions }),
            }}
          >
            Review and record exception
          </Link>
        </Button>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Refresh report
          </Button>
        )}
      </div>
    </div>
  );
}
