import { fromMinorUnits } from "@/lib/accounting/money";

export type FundInsightInput = {
  fundId: string;
  fundCode: string;
  incomeMinor: number;
  expenseMinor: number;
  availableMinor: number;
  currency: string;
};

export type NonprofitInsight = {
  text: string;
  evidenceIds: string[];
  /** Always empty. Insights never post, approve, release restrictions or change records. */
  autonomousActions: readonly [];
};

function money(minor: number, currency: string): string {
  return `${fromMinorUnits(minor, currency)} ${currency}`;
}

/**
 * Explains fund figures the caller already loaded from authorised records.
 * It does not query the ledger and it does not return an executable action.
 */
export function explainFundUtilisation(rows: readonly FundInsightInput[]): NonprofitInsight {
  if (rows.length === 0) {
    return {
      text: "No fund records were supplied, so there is nothing to explain.",
      evidenceIds: [],
      autonomousActions: [],
    };
  }
  const sentences = rows.map((row) => {
    const net = row.incomeMinor - row.expenseMinor;
    return `${row.fundCode} (${row.fundId}) shows income ${money(row.incomeMinor, row.currency)}, expenditure ${money(row.expenseMinor, row.currency)}, net ${money(net, row.currency)} and available ${money(row.availableMinor, row.currency)}.`;
  });
  return {
    text: `${sentences.join(" ")} These figures are explanatory only and do not post, approve, release restrictions or change any record.`,
    evidenceIds: rows.map((row) => row.fundId),
    autonomousActions: [],
  };
}
