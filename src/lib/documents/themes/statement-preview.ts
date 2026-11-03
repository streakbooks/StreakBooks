import type { StatementSheetData } from "@/components/documents/CustomerStatementSheet";
/** Clearly labelled illustrative design data; never used by live statement reports. */
export function statementPreview(long = false): StatementSheetData {
  const count = long ? 65 : 2;
  return {
    from: "2026-11-01",
    to: "2026-11-30",
    position: [],
    currencies: [
      {
        currency_code: "GBP",
        opening_balance_minor: 0,
        closing_balance_minor: count * 12000,
        total_debits_minor: count * 12000,
        total_credits_minor: 0,
        lines: Array.from({ length: count }, (_, i) => ({
          id: `sample-${i}`,
          type: "invoice" as const,
          date: "2026-11-01",
          reference: `EXAMPLE-${i + 1}`,
          description: "Example invoice",
          debit_minor: 12000,
          credit_minor: 0,
          balance_minor: (i + 1) * 12000,
          status: "authorised",
        })),
      },
    ],
  };
}
