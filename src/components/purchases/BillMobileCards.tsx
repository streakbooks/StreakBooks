import { Eye, ExternalLink, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/common/stat-card";
import { billCardDisplayStatus } from "@/lib/visual/transaction-card-status";
import { cn } from "@/lib/utils";

export type BillMobileRow = {
  id: string;
  display_reference: string | null;
  bill_date: string;
  due_date: string;
  status: string;
  document_total_minor: number;
  balance_due_minor: number;
  currency_code: string;
  days_overdue: number;
  attachment_count: number;
  contacts: { name: string; account_number: string | null } | null;
};

/** Read-only mobile presentation; selection and mutations remain owned by the Bills workspace. */
export function BillMobileCards({
  rows,
  selected,
  density,
  baseCurrency,
  money,
  onSelect,
  onPreview,
  onOpen,
  onOpenFiles,
}: {
  rows: readonly BillMobileRow[];
  selected: ReadonlySet<string>;
  density: "compact" | "comfortable";
  baseCurrency: string;
  money: (minor: number, currency: string) => string;
  onSelect: (billId: string, selected: boolean) => void;
  onPreview: (billId: string) => void;
  onOpen: (billId: string) => void;
  onOpenFiles: (billId: string) => void;
}) {
  return (
    <section aria-label="Mobile bills" className="space-y-3">
      {rows.map((bill) => {
        const currency = bill.currency_code || baseCurrency;
        const reference = bill.display_reference ?? bill.id.slice(0, 8);
        const unposted = bill.status === "draft" || bill.status === "awaiting_approval";
        return (
          <article
            key={bill.id}
            className={cn(
              "rounded-2xl border shadow-card transition-[border-color,box-shadow] hover:shadow-sm",
              selected.has(bill.id) ? "border-primary/45 bg-primary/5" : "border-border/85 bg-card",
              density === "compact" ? "p-3" : "p-4",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Supplier bill</p>
                <h3 className="mt-1 break-words text-base font-bold tracking-[-0.02em]">{reference}</h3>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {bill.contacts?.name ?? "Supplier not specified"}
                </p>
              </div>
              <StatusBadge status={billCardDisplayStatus(bill)} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-border/55 bg-muted/25 p-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Bill date</dt>
                <dd className="mt-1 font-medium">{bill.bill_date}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Due date</dt>
                <dd
                  className={cn(
                    "mt-1 font-medium",
                    bill.days_overdue > 0 && bill.balance_due_minor > 0 && !unposted && "text-destructive",
                  )}
                >
                  {bill.due_date || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {money(bill.document_total_minor, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Outstanding AP</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {unposted ? (
                    <span className="text-xs font-normal text-muted-foreground">Unposted</span>
                  ) : (
                    money(bill.balance_due_minor, currency)
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <label className="mr-auto flex min-h-9 cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={selected.has(bill.id)}
                  onCheckedChange={(checked) => onSelect(bill.id, checked === true)}
                  aria-label={"Select bill " + reference}
                />
                Select
              </label>
              {bill.attachment_count > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={"Open attachments for bill " + reference}
                  onClick={() => onOpenFiles(bill.id)}
                >
                  <Paperclip className="size-4" aria-hidden />
                  {bill.attachment_count}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={"Preview bill " + reference}
                onClick={() => onPreview(bill.id)}
              >
                <Eye className="size-4" aria-hidden />
                Preview
              </Button>
              <Button
                type="button"
                size="sm"
                aria-label={"Open bill " + reference}
                onClick={() => onOpen(bill.id)}
              >
                Open <ExternalLink className="size-4" aria-hidden />
              </Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
