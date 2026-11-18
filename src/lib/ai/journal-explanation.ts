import { fromMinorUnits } from "@/lib/accounting/money";

export type JournalAccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type JournalLineInput = {
  id: string;
  line_no: number;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string | null;
  account_active: boolean | null;
  description: string | null;
  debit_minor: string;
  credit_minor: string;
};

export type PostedJournalInput = {
  id: string;
  journal_number: number;
  journal_date: string;
  status: string;
  memo: string | null;
  source_type: string;
  source_id: string | null;
  currency_code: string;
  reverses_journal_id: string | null;
  lines: JournalLineInput[];
};

export type JournalExplanationLine = JournalLineInput & {
  debit_display: string;
  credit_display: string;
  meaning: string;
};

export type JournalReviewAction = {
  id: string;
  title: string;
  detail: string;
  severity: "review" | "info";
};

export type JournalExplanation = {
  journal: Omit<PostedJournalInput, "lines">;
  lines: JournalExplanationLine[];
  total_debit_minor: string;
  total_credit_minor: string;
  balanced: boolean;
  summary: string;
  actions: JournalReviewAction[];
  limitations: string[];
};

const TYPE_LABELS: Record<JournalAccountType, string> = {
  asset: "asset",
  liability: "liability",
  equity: "equity",
  income: "income",
  expense: "expense",
};

function checkedMinor(value: string): bigint {
  if (!/^-?\d+$/.test(value)) throw new Error("A journal line has an invalid minor-unit value");
  return BigInt(value);
}

export function exactJournalMinorString(raw: unknown): string {
  if (typeof raw === "string" && /^-?\d+$/.test(raw)) return BigInt(raw).toString();
  if (typeof raw === "number" && Number.isSafeInteger(raw)) return BigInt(raw).toString();
  throw new Error("Journal amount is not available at exact minor-unit precision");
}

export function accountPostingMeaning(
  type: string | null,
  debitMinor: bigint,
  creditMinor: bigint,
): string {
  if (debitMinor < 0n || creditMinor < 0n)
    return "A negative debit or credit is present; inspect the original entry.";
  if (debitMinor === 0n && creditMinor === 0n) return "No movement to explain.";
  if (debitMinor > 0n && creditMinor > 0n)
    return "Both debit and credit columns contain a positive amount; inspect the source line.";
  const t =
    type && Object.prototype.hasOwnProperty.call(TYPE_LABELS, type)
      ? (type as JournalAccountType)
      : null;
  if (!t) return "Account classification is unavailable; inspect the original chart of accounts.";
  const debitIncreases = t === "asset" || t === "expense";
  const increases = debitMinor > 0n ? debitIncreases : !debitIncreases;
  return (
    (debitMinor > 0n ? "Debit" : "Credit") +
    " to an " +
    TYPE_LABELS[t] +
    " account generally " +
    (increases ? "increases" : "decreases") +
    " its account balance. This describes the bookkeeping direction, not the business purpose."
  );
}

const SOURCES_WITH_DOCUMENTS = new Set([
  "sales_invoice",
  "sales_credit_note",
  "purchase_bill",
  "purchase_credit_note",
  "expense",
  "supplier_payment",
]);

/**
 * Builds an explanatory, read-only review from one already-authorised journal.
 * Uses exact BigInt arithmetic and serialises only strings to the browser.
 * Does not generate a suggested accounting correction or post anything.
 */
export function buildJournalExplanation(input: PostedJournalInput): JournalExplanation {
  if (input.status !== "posted") throw new Error("Only posted journals can be explained here");
  if (input.lines.length < 2 || input.lines.length > 200) {
    throw new Error("Journal detail must contain between 2 and 200 lines for review");
  }
  const currency = input.currency_code.trim();
  if (!currency || currency.length > 4) throw new Error("Journal currency is invalid");

  let debitTotal = 0n;
  let creditTotal = 0n;
  const actions: JournalReviewAction[] = [];
  let atypicalLines = 0;
  let inactiveAccounts = 0;
  let unclassifiedAccounts = 0;
  const lines = input.lines.map((line) => {
    const debit = checkedMinor(line.debit_minor);
    const credit = checkedMinor(line.credit_minor);
    debitTotal += debit;
    creditTotal += credit;
    if (debit < 0n || credit < 0n || (debit > 0n && credit > 0n) || (debit === 0n && credit === 0n))
      atypicalLines++;
    if (line.account_active === false) inactiveAccounts++;
    if (!line.account_type || !Object.prototype.hasOwnProperty.call(TYPE_LABELS, line.account_type))
      unclassifiedAccounts++;
    return {
      ...line,
      debit_display: currency + " " + fromMinorUnits(debit, currency),
      credit_display: currency + " " + fromMinorUnits(credit, currency),
      meaning: accountPostingMeaning(line.account_type, debit, credit),
    };
  });

  const balanced = debitTotal > 0n && debitTotal === creditTotal;
  if (!balanced) {
    actions.push({
      id: "balance",
      title: "Investigate journal balancing",
      detail:
        "Debit and credit totals do not match or no positive debit is present. Inspect the original journal and ledger integrity.",
      severity: "review",
    });
  }
  if (atypicalLines) {
    actions.push({
      id: "atypical_lines",
      title: "Review unusual journal lines",
      detail:
        String(atypicalLines) +
        " line(s) have negative, double-sided or zero movements. Investigate their posting and source context.",
      severity: "review",
    });
  }
  if (inactiveAccounts) {
    actions.push({
      id: "inactive_accounts",
      title: "Check inactive accounts",
      detail:
        String(inactiveAccounts) +
        " line(s) reference an account currently inactive. Historical use may be valid; verify effective dates and coding.",
      severity: "review",
    });
  }
  if (unclassifiedAccounts) {
    actions.push({
      id: "unclassified_accounts",
      title: "Verify account classification",
      detail:
        String(unclassifiedAccounts) +
        " line(s) lack a recognised account classification. Interpret them using the chart of accounts.",
      severity: "review",
    });
  }
  if (!input.memo?.trim()) {
    actions.push({
      id: "memo",
      title: "Check supporting narrative",
      detail:
        "No journal header memo is recorded. Confirm the business reason from original documentation and existing review procedures.",
      severity: "review",
    });
  }
  if (SOURCES_WITH_DOCUMENTS.has(input.source_type) && !input.source_id) {
    actions.push({
      id: "source",
      title: "Check the source-document reference",
      detail:
        "The journal is marked as originating from a document but contains no source ID in this record. Locate its supporting document.",
      severity: "review",
    });
  }
  actions.push(
    {
      id: "source_support",
      title: "Verify source and substance",
      detail:
        "Open the originating document and confirm amounts, dates, counterparties and classification against the journal. A source link is not proof of completeness.",
      severity: "info",
    },
    {
      id: "period_tax",
      title: "Review cut-off, tax and approvals",
      detail:
        "Confirm period permissions, tax treatment, relevant attachments and approvals in the originating workflow. These checks are not automated here.",
      severity: "info",
    },
  );
  const sourceText = input.source_type.replaceAll("_", " ");
  const { lines: _inputLines, ...journal } = input;
  void _inputLines;
  return {
    journal,
    lines,
    total_debit_minor: debitTotal.toString(),
    total_credit_minor: creditTotal.toString(),
    balanced,
    summary:
      "Posted journal #" +
      input.journal_number +
      " dated " +
      input.journal_date +
      " has " +
      lines.length +
      " line(s), sourced as " +
      sourceText +
      ", recorded in " +
      currency +
      ". " +
      (balanced
        ? "The debits and credits total equally; correctness of classification and supporting documentation remains unverified."
        : "The reported debit and credit totals need further investigation."),
    actions,
    limitations: [
      "All amounts are in the journal's recorded currency. No FX conversion or reporting-basis adjustment is inferred.",
      "Account explanations describe standard debit/credit direction only; they do not establish why a transaction occurred.",
      "This review uses the currently recorded journal and account master data; it is not an audit finding or approval.",
      "No journal, bank transaction, source document or approval is modified by this explanation.",
    ],
  };
}
