import { Link } from "@tanstack/react-router";
import type { StatementCurrency } from "@/lib/sales/statement";
import type { DocumentBranding, PrintDocument } from "@/lib/documents/types";
import { formatMoney } from "@/lib/format/format";
import { DocumentSheet } from "./DocumentSheet";
export type StatementSheetData = {
  from: string | null;
  to: string | null;
  currencies: StatementCurrency[];
  position: Array<{
    currency_code: string;
    outstandingMinor: number;
    unappliedCreditMinor: number;
    unappliedReceiptMinor: number;
  }>;
};
export function CustomerStatementSheet({
  statement,
  customerName,
  branding,
  locale = "en-GB",
  dateFormat = null,
  interactive = true,
}: {
  statement: StatementSheetData;
  customerName: string;
  branding: DocumentBranding;
  locale?: string;
  dateFormat?: string | null;
  interactive?: boolean;
}) {
  // Neutral header shell: statement money is rendered exclusively from the existing statement model below.
  const shell: PrintDocument = {
    kind: "sales_invoice",
    id: "statement",
    title: "Customer statement",
    number: null,
    status: "statement",
    mark: null,
    currency: "GBP",
    fxRateToBase: null,
    baseCurrency: "GBP",
    issueDate: statement.to ?? new Date().toISOString().slice(0, 10),
    dueDate: null,
    expiryDate: null,
    reference: statement.from ? `From ${statement.from}` : null,
    party: {
      roleLabel: "Statement for",
      name: customerName,
      addressLines: [],
      email: null,
      phone: null,
      taxNumber: null,
    },
    lines: [],
    showLines: false,
    taxSummary: [],
    totals: {
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      paidMinor: 0,
      creditedMinor: 0,
      dueMinor: null,
    },
    allocations: [],
    allocationsTitle: null,
    paymentAmountMinor: null,
    extraMeta: [],
    notes: branding.defaultNotes,
    showPaymentDetails: true,
    paymentTermsText: null,
    partyEmail: null,
    partyId: null,
  };
  return (
    <DocumentSheet document={shell} branding={branding} locale={locale} dateFormat={dateFormat}>
      {statement.currencies.length === 0 && (
        <p className="mt-5">No posted activity for this customer.</p>
      )}
      {statement.currencies.map((c) => {
        const m = (value: number) => formatMoney(value, c.currency_code, locale);
        const pos = statement.position.find((p) => p.currency_code === c.currency_code);
        return (
          <section key={c.currency_code} className="mt-6 space-y-2">
            <h2>{c.currency_code}</h2>
            <div className="doc-keep flex flex-wrap gap-4 text-sm">
              <span>
                Opening balance <strong>{m(c.opening_balance_minor)}</strong>
              </span>
              <span>
                Closing balance <strong>{m(c.closing_balance_minor)}</strong>
              </span>
              {pos && (
                <>
                  <span>
                    Invoices outstanding today <strong>{m(pos.outstandingMinor)}</strong>
                  </span>
                  <span>
                    Unapplied credits <strong>{m(pos.unappliedCreditMinor)}</strong>
                  </span>
                  <span>
                    Unallocated receipts <strong>{m(pos.unappliedReceiptMinor)}</strong>
                  </span>
                </>
              )}
            </div>
            <table aria-label={`${c.currency_code} statement`}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5}>Opening balance</td>
                  <td className="num">{m(c.opening_balance_minor)}</td>
                </tr>
                {c.lines.map((l) => (
                  <tr key={`${l.type}-${l.id}-${l.date}`}>
                    <td>{l.date}</td>
                    <td>{l.type.replace("_", " ")}</td>
                    <td>
                      {l.type === "void" || !interactive ? (
                        (l.reference ?? l.id.slice(0, 8))
                      ) : l.type === "invoice" ? (
                        <Link
                          className="underline"
                          to="/sales/invoices/$invoiceId"
                          params={{ invoiceId: l.id }}
                        >
                          {l.reference ?? l.id.slice(0, 8)}
                        </Link>
                      ) : l.type === "receipt" ? (
                        <Link
                          className="underline"
                          to="/sales/receipts/$receiptId"
                          params={{ receiptId: l.id }}
                        >
                          {l.reference ?? l.id.slice(0, 8)}
                        </Link>
                      ) : (
                        <Link
                          className="underline"
                          to="/sales/credit-notes/$creditNoteId"
                          params={{ creditNoteId: l.id }}
                        >
                          {l.reference ?? l.id.slice(0, 8)}
                        </Link>
                      )}
                    </td>
                    <td className="num">{l.debit_minor ? m(l.debit_minor) : "—"}</td>
                    <td className="num">{l.credit_minor ? m(l.credit_minor) : "—"}</td>
                    <td className="num">{m(l.balance_minor)}</td>
                  </tr>
                ))}
                {!c.lines.length && (
                  <tr>
                    <td colSpan={6}>No posted activity in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="mt-4 text-xs">
        Opening balance is everything owed before the start date. Each currency is shown on its own
        and never added to another.
      </p>
    </DocumentSheet>
  );
}
