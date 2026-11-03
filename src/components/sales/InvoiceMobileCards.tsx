import { Link } from "@tanstack/react-router";
import { Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/stat-card";
import { invoiceIsOverdue, invoiceOutstandingMinor } from "@/lib/sales/invoice-list-display";
import { cn } from "@/lib/utils";

export type InvoiceMobileRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string;
  status: string;
  total_minor: number;
  amount_paid_minor: number;
  amount_credited_minor: number;
  currency_code: string;
  contacts: { name: string } | null;
};

export function InvoiceMobileCards({
  rows,
  today,
  density,
  date,
  money,
  onPreview,
}: {
  rows: readonly InvoiceMobileRow[];
  today: string;
  density: "compact" | "comfortable";
  date: (value: string) => string;
  money: (minor: number, currency: string) => string;
  onPreview: (invoiceId: string) => void;
}) {
  return (
    <section aria-label="Mobile invoices" className="space-y-3">
      {rows.map((invoice) => {
        const outstanding = invoiceOutstandingMinor(invoice);
        const overdue = invoiceIsOverdue(invoice, today);
        const number = invoice.invoice_number ?? invoice.id.slice(0, 8);
        return (
          <article
            key={invoice.id}
            className={cn(
              "rounded-xl border bg-card shadow-sm",
              density === "compact" ? "p-3" : "p-4",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Invoice</p>
                <h3 className="mt-1 break-words text-base font-semibold">{number}</h3>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {invoice.contacts?.name ?? "Customer not specified"}
                </p>
              </div>
              <StatusBadge status={overdue ? "overdue" : invoice.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Invoice date</dt>
                <dd className="mt-1 font-medium">{date(invoice.invoice_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Due date</dt>
                <dd className="mt-1 font-medium">{date(invoice.due_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {money(invoice.total_minor, invoice.currency_code)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Outstanding</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {money(outstanding, invoice.currency_code)}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={"Preview invoice " + number}
                onClick={() => onPreview(invoice.id)}
              >
                <Eye className="size-4" aria-hidden />
                Preview
              </Button>
              <Button size="sm" asChild>
                <Link
                  to="/sales/invoices/$invoiceId"
                  params={{ invoiceId: invoice.id }}
                  aria-label={"Open invoice " + number}
                >
                  Open <ExternalLink className="size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
