import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/stat-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BankTxnListRow } from "@/lib/banking/banking.functions";
import { bankingReviewShortcut } from "@/lib/banking/review-shortcuts";

type Props = {
  transaction: BankTxnListRow | null;
  accountName: string;
  currency: string;
  pagePosition: number;
  pageTotal: number;
  formatDate: (value: string) => string;
  formatMoney: (amountMinor: number, currency: string) => string;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

/**
 * A read-only transaction review surface built from already authorised list data.
 * Mutations remain exclusively in the existing bank coding/reconciliation workflows.
 */
export function BankTransactionQuickPreview({
  transaction,
  accountName,
  currency,
  pagePosition,
  pageTotal,
  formatDate,
  formatMoney,
  onClose,
  onPrevious,
  onNext,
}: Props) {
  return (
    <Sheet open={Boolean(transaction)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-lg"
        aria-label="Bank transaction preview"
        onKeyDown={(event) => {
          const target = event.target;
          const editing =
            target instanceof HTMLElement &&
            Boolean(
              target.closest(
                "input, textarea, select, [contenteditable='true'], [role='combobox']",
              ),
            );
          const shortcut = bankingReviewShortcut({
            key: event.key,
            modified: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
            editing,
            previewOpen: true,
          });
          if (shortcut === "previous" && pagePosition > 1) {
            event.preventDefault();
            onPrevious();
          } else if (shortcut === "next" && pagePosition < pageTotal) {
            event.preventDefault();
            onNext();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle>Bank transaction preview</SheetTitle>
          <SheetDescription>
            Read-only summary from this page. Use the full transaction workspace for coding,
            matching and reconciliation.
          </SheetDescription>
        </SheetHeader>
        {transaction ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatDate(transaction.txn_date)}
                </p>
                <StatusBadge status={transaction.status} />
              </div>
              <p className="mt-3 break-words text-lg font-semibold">
                {transaction.description ?? "Bank transaction"}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {formatMoney(transaction.amount_minor, currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Amount in the bank account's currency
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Bank account</dt>
                <dd className="mt-1 break-words font-medium">{accountName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Payee</dt>
                <dd className="mt-1 break-words font-medium">{transaction.payee ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="mt-1 break-words font-medium">{transaction.reference ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Contact</dt>
                <dd className="mt-1 break-words font-medium">{transaction.contact_name ?? "—"}</dd>
              </div>
              {transaction.exclude_reason ? (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Exclusion reason</dt>
                  <dd className="mt-1 break-words font-medium">{transaction.exclude_reason}</dd>
                </div>
              ) : null}
            </dl>
            <section aria-label="Linked journals" className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Linked journals</h3>
              {transaction.links.some((link) => Boolean(link.journalId)) ? (
                <ul className="space-y-2">
                  {transaction.links
                    .filter((link) => Boolean(link.journalId))
                    .map((link) => (
                      <li key={link.journalLineId}>
                        {link.journalId ? (
                          <Link
                            to="/banking/journal/$journalId"
                            params={{ journalId: link.journalId }}
                            className="inline-flex items-center gap-1 rounded-sm text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                            onClick={onClose}
                          >
                            Journal #{link.journalNumber ?? "—"}
                            {link.reversed ? " (reversed)" : ""}
                            <ExternalLink className="size-3.5" aria-hidden />
                          </Link>
                        ) : null}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No linked journals on this transaction.
                </p>
              )}
            </section>
            <Button asChild className="w-full">
              <Link
                to="/banking/transactions"
                search={{ transactionId: transaction.id, statusGroup: "all" }}
                onClick={onClose}
              >
                View transaction in workspace
                <ExternalLink className="size-4" aria-hidden />
              </Link>
            </Button>
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <Button size="sm" variant="outline" disabled={pagePosition <= 1} onClick={onPrevious}>
                <ArrowLeft className="size-4" aria-hidden />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {pagePosition} of {pageTotal} on this page
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={pagePosition >= pageTotal}
                onClick={onNext}
              >
                Next
                <ArrowRight className="size-4" aria-hidden />
              </Button>
              <p className="sr-only">
                Use the left and right arrow keys to review the previous or next transaction.
              </p>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
