import { fromMinorUnits } from "@/lib/accounting/money";
import { toCsv } from "@/lib/sales/csv";
import { validateConversion, type ConversionInput } from "./conversion-balances";

type NamedRow = { id: string; name: string; code?: string };

export function conversionReviewCsv(
  input: ConversionInput,
  accounts: readonly NamedRow[],
  contacts: readonly NamedRow[],
): string {
  const result = validateConversion(input);
  if (!result.canPost) {
    throw new Error("Resolve conversion validation errors before exporting the posting review.");
  }

  const accountMap = new Map(accounts.map((row) => [row.id, row]));
  const contactMap = new Map(contacts.map((row) => [row.id, row.name]));
  const base = input.baseCurrency.toUpperCase();
  const rows: unknown[][] = [];
  for (const entry of input.tb) {
    if (entry.debitMinor === 0n && entry.creditMinor === 0n) continue;
    const account = accountMap.get(entry.accountId);
    rows.push([
      "Trial balance",
      account?.code ?? entry.accountId,
      account?.name ?? "Account",
      result.summary.openingDate,
      base,
      fromMinorUnits(entry.debitMinor, base),
      fromMinorUnits(entry.creditMinor, base),
      "",
    ]);
  }
  for (const [kind, documents] of [
    ["Opening invoice", input.invoices],
    ["Opening bill", input.bills],
  ] as const) {
    for (const doc of documents) {
      const currency = (doc.currencyCode || base).toUpperCase();
      rows.push([
        kind,
        doc.reference,
        contactMap.get(doc.contactId) ?? doc.contactId,
        doc.documentDate,
        currency,
        kind === "Opening invoice" ? fromMinorUnits(doc.amountMinor, currency) : "",
        kind === "Opening bill" ? fromMinorUnits(doc.amountMinor, currency) : "",
        doc.fxRate ?? "",
      ]);
    }
  }
  rows.push([
    "Base-currency total",
    "",
    "Includes opening receivables/payables at conversion-date rates",
    result.summary.openingDate,
    base,
    fromMinorUnits(result.summary.debits, base),
    fromMinorUnits(result.summary.credits, base),
    "",
  ]);
  if (!result.summary.balanced) {
    rows.push([
      "Opening balance equity adjustment",
      "",
      "Requires explicit confirmation",
      result.summary.openingDate,
      base,
      result.summary.difference < 0n ? fromMinorUnits(-result.summary.difference, base) : "",
      result.summary.difference > 0n ? fromMinorUnits(result.summary.difference, base) : "",
      "",
    ]);
  }
  return toCsv(
    [
      "Entry",
      "Account code or reference",
      "Account or contact",
      "Date",
      "Currency",
      "Debit (row currency)",
      "Credit (row currency)",
      "FX rate to base",
    ],
    rows,
  );
}
