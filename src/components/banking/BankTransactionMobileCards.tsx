import { Eye, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/common/stat-card";
import type { BankTxnListRow } from "@/lib/banking/banking.functions";
import { cn } from "@/lib/utils";

type Props = {
  rows: BankTxnListRow[];
  selected: ReadonlySet<string>;
  density: "compact" | "comfortable";
  formatDate: (value: string) => string;
  formatMoney: (minor: number, currency: string) => string;
  accountName: (id: string) => string;
  accountCurrency: (id: string) => string;
  onSelect: (id: string, selected: boolean) => void;
  onPreview: (id: string) => void;
  onReview: (id: string, mode: "code" | "match") => void;
  onManage: (id: string) => void;
};

/**
 * Mobile view of the existing, company-authorised bank transaction page.
 * Financial actions switch to the original table workflow; no second posting surface.
 */
export function BankTransactionMobileCards({
  rows,
  selected,
  density,
  formatDate,
  formatMoney,
  accountName,
  accountCurrency,
  onSelect,
  onPreview,
  onReview,
  onManage,
}: Props) {
  return (
    <section aria-label="Mobile bank transactions" className="space-y-3">
      {rows.map((txn) => (
        <article
          key={txn.id}
          className={cn(
            "rounded-2xl border border-border/85 bg-card shadow-card transition-[border-color,box-shadow] hover:shadow-sm",
            density === "compact" ? "p-3" : "p-4",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{formatDate(txn.txn_date)}</p>
              <h3 className="mt-1 break-words font-bold leading-snug tracking-[-0.02em]">
                {txn.description || "Bank transaction"}
              </h3>
              {txn.payee ? (
                <p className="mt-1 truncate text-xs text-muted-foreground" title={txn.payee}>
                  {txn.payee}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p
                className={cn(
                  "text-base font-bold tracking-[-0.02em] tabular-nums",
                  txn.amount_minor > 0 && "text-money-in",
                  txn.amount_minor < 0 && "text-money-out",
                )}
              >
                {formatMoney(txn.amount_minor, accountCurrency(txn.bank_account_id))}
              </p>
              <div className="mt-1">
                <StatusBadge status={txn.status} />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-border/55 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
            <span className="truncate">{accountName(txn.bank_account_id)}</span>
            {txn.reference ? (
              <span className="max-w-full break-words">Ref: {txn.reference}</span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            {txn.status === "uncategorised" ? (
              <label className="mr-auto flex min-h-9 cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={selected.has(txn.id)}
                  onCheckedChange={(checked) => onSelect(txn.id, checked === true)}
                  aria-label={"Select " + (txn.description ?? "transaction")}
                />
                Select
              </label>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={"Preview transaction " + (txn.description ?? formatDate(txn.txn_date))}
              onClick={() => onPreview(txn.id)}
            >
              <Eye className="size-4" aria-hidden />
              Preview
            </Button>
            {txn.status === "uncategorised" ? (
              <>
                <Button type="button" size="sm" onClick={() => onReview(txn.id, "code")}>
                  Code
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onReview(txn.id, "match")}
                >
                  Match
                </Button>
              </>
            ) : txn.status === "reconciled" ? (
              <span className="text-xs text-muted-foreground">Reopen reconciliation to change</span>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => onManage(txn.id)}>
                <ListChecks className="size-4" aria-hidden />
                Manage
              </Button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
