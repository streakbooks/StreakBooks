import type { AccountMeta } from "@/lib/accounting/ledger-data";
import type { CashJournal, CashPnlInput } from "./cash-profit-loss";
import { isReportDate } from "./date-validation";

export const CASH_CLASSIFICATION_EXCEPTION_PREFIX = "CASH_CLASSIFICATION_EXCEPTION:";
export type CashClassificationKind =
  | "balance_sheet"
  | "conversion"
  | "inventory"
  | "prepaid"
  | "deferred"
  | "payroll_wages"
  | "payroll_employer_tax"
  | "payroll_deductions";
export type CashJournalEvidenceSnapshot = {
  id: string;
  company_id: string;
  journal_date: string;
  currency_code: string;
  fx_rate_to_base: string | null;
  source_type: string;
  source_id?: string | null;
  status: string;
  lines: Array<{ id: string; account_id: string; debit_minor: string; credit_minor: string }>;
};
export type CashClassificationPolicy = {
  id: string;
  companyId: string;
  sourceAccountId: string;
  recognitionAccountId: string;
  kind: CashClassificationKind;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  policyNote: string;
  evidenceReference: string;
  evidenceJournalIds: string[];
  approvedBy: string | null;
  approvedAt: string | null;
  evidenceJournalSnapshots: CashJournalEvidenceSnapshot[];
};
export type CashOpeningEvidence = {
  id: string;
  companyId: string;
  documentId: string;
  sourceKind: "sales_invoice" | "purchase_bill";
  postedJournalId: string;
  controlAccountId: string;
  equityAccountId: string;
  currency: string;
  grossMinor: bigint;
  components: Array<{ accountId: string; amountMinor: bigint }>;
  mode: "recognize_on_settlement" | "already_recognized";
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  policyNote: string;
  evidenceReference: string;
  approvedBy: string | null;
  approvedAt: string | null;
  sourceJournalSnapshot: CashJournalEvidenceSnapshot;
  taxLines?: Array<{ id: string; netMinor: bigint; taxMinor: bigint; taxCodeId: string | null }>;
};
export type CashClassificationException = {
  code: string;
  message: string;
  companyId: string;
  sourceAccountId: string | null;
  journalId: string | null;
  documentId: string | null;
  amountMinor: string;
  currency: string;
  date: string;
  period: { from: string; to: string };
  missingEvidence: string[];
};
/** The payload stays traceable when server-function transports serialize only Error.message. */
export class CashClassificationError extends Error {
  readonly exceptions: CashClassificationException[];
  constructor(exceptions: CashClassificationException[]) {
    super(
      CASH_CLASSIFICATION_EXCEPTION_PREFIX +
        JSON.stringify({ message: exceptions[0]?.message, exceptions }),
    );
    this.name = "CashClassificationError";
    this.exceptions = exceptions;
  }
}
export function cashClassificationExceptions(error: unknown): CashClassificationException[] {
  if (error instanceof CashClassificationError) return error.exceptions;
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
  const start = message.indexOf(CASH_CLASSIFICATION_EXCEPTION_PREFIX);
  if (start < 0) return [];
  try {
    const value = JSON.parse(
      message.slice(start + CASH_CLASSIFICATION_EXCEPTION_PREFIX.length),
    ) as { exceptions?: CashClassificationException[] };
    return Array.isArray(value.exceptions)
      ? value.exceptions
          .filter(
            (item) =>
              item &&
              typeof item.companyId === "string" &&
              typeof item.message === "string" &&
              typeof item.amountMinor === "string" &&
              /^-?\d+$/.test(item.amountMinor) &&
              /^[A-Z]{3}$/.test(item.currency) &&
              item.period &&
              isReportDate(item.period.from) &&
              isReportDate(item.period.to) &&
              Array.isArray(item.missingEvidence) &&
              item.missingEvidence.every((entry) => typeof entry === "string"),
          )
          .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

// These are structured chart metadata values, never account labels or inferred IDs.
const policyKinds = new Set([
  "inventory",
  "stock",
  "prepayment",
  "prepaid",
  "prepaid_expense",
  "deferred",
  "deferred_income",
  "deferred_revenue",
  "accrual",
  "accrued_expense",
  "accrued_expenses",
  "payroll",
  "payroll_liability",
  "payroll_tax",
  "payroll_deductions",
  "wages_payable",
  "current_asset",
  "current_liability",
  "other_asset",
  "other_liability",
  "current",
]);
export function accountNeedsCashClassification(account: AccountMeta): boolean {
  if (
    [
      "ar",
      "ap",
      "accounts_receivable",
      "accounts_payable",
      "tax",
      "vat",
      "gst",
      "sales_tax",
      "tax_payable",
      "bank",
      "undeposited_funds",
      "stripe_clearing",
      "payment_processor_clearing",
    ].includes(account.system_key ?? "")
  )
    return false;
  return (
    !["income", "expense"].includes(account.account_type) &&
    [account.account_kind, account.subtype, account.system_key].some(
      (value) => value !== null && policyKinds.has(value),
    )
  );
}
export function cashJournalEvidenceSnapshot(journal: CashJournal): CashJournalEvidenceSnapshot {
  return {
    id: journal.id,
    company_id: journal.companyId,
    journal_date: journal.date,
    currency_code: journal.currency,
    fx_rate_to_base: journal.rate,
    source_type: journal.sourceType,
    source_id: journal.sourceId,
    status: "posted",
    lines: journal.lines
      .map((line) => ({
        id: line.lineId ?? "",
        account_id: line.accountId,
        debit_minor: line.debit.toString(),
        credit_minor: line.credit.toString(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
export function cashEvidenceMatches(
  journal: CashJournal,
  snapshot: CashJournalEvidenceSnapshot | undefined,
) {
  if (!snapshot || !Array.isArray(snapshot.lines)) return false;
  const actual = cashJournalEvidenceSnapshot(journal);
  return (
    actual.id === snapshot.id &&
    actual.company_id === snapshot.company_id &&
    actual.journal_date === snapshot.journal_date &&
    actual.currency_code === snapshot.currency_code &&
    canonicalDecimal(actual.fx_rate_to_base) === canonicalDecimal(snapshot.fx_rate_to_base) &&
    actual.source_type === snapshot.source_type &&
    (snapshot.source_id === undefined || snapshot.source_id === journal.sourceId) &&
    snapshot.status === "posted" &&
    JSON.stringify(actual.lines) ===
      JSON.stringify(
        snapshot.lines
          .map((line) => ({
            id: line.id,
            account_id: line.account_id,
            debit_minor: line.debit_minor,
            credit_minor: line.credit_minor,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      )
  );
}
function canonicalDecimal(value: string | null): string | null {
  if (value === null) return null;
  if (!/^\d+(\.\d+)?$/.test(value)) return value;
  const [integer = "0", fraction = ""] = value.split(".");
  return (
    integer.replace(/^0+(?=\d)/, "") +
    (fraction.replace(/0+$/, "") ? "." + fraction.replace(/0+$/, "") : "")
  );
}

export function cashClassificationContext(
  input: CashPnlInput,
  period: { from: string; to: string },
) {
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const journals = new Map(input.journals.map((j) => [j.id, j]));
  const policies = input.classificationPolicies ?? [];
  const fail = (
    message: string,
    missingEvidence: string[],
    journal: CashJournal,
    accountId: string | null,
    amount: bigint,
    documentId: string | null = journal.sourceId,
  ): never => {
    throw new CashClassificationError([
      {
        code: "cash_classification_required",
        message,
        companyId: input.companyId,
        sourceAccountId: accountId,
        journalId: journal.id,
        documentId,
        amountMinor: amount.toString(),
        currency: journal.currency,
        date: journal.date,
        period,
        missingEvidence,
      },
    ]);
  };
  const needsPolicy = (accountId: string) => {
    if (input.cashAccountIds.includes(accountId)) return false;
    const account = accounts.get(accountId);
    return Boolean(
      account &&
      (accountNeedsCashClassification(account) ||
        policies.some((p) => p.sourceAccountId === accountId && p.kind !== "conversion")),
    );
  };
  function classify(
    accountId: string,
    journal: CashJournal,
    date: string,
    amount: bigint,
    documentId?: string | null,
  ): string {
    if (amount === 0n || !needsPolicy(accountId)) return accountId;
    const candidates = policies
      .filter(
        (p) =>
          p.companyId === input.companyId &&
          p.sourceAccountId === accountId &&
          p.status === "approved" &&
          p.effectiveFrom <= date &&
          (!p.effectiveTo || p.effectiveTo >= date),
      )
      .sort((a, b) => b.version - a.version);
    const policy = candidates[0];
    if (!policy)
      return fail(
        "Inventory, prepayment, deferred or payroll/accrual accounts need a reviewed cash-recognition policy; they cannot be silently omitted from cash P&L.",
        [
          "Approved source-account classification with an effective date and supporting posted transactions",
        ],
        journal,
        accountId,
        amount,
        documentId,
      );
    const source = accounts.get(accountId)!;
    const target = accounts.get(policy.recognitionAccountId);
    const expected = policy.kind === "deferred" ? "income" : "expense";
    if (
      !target ||
      (policy.kind === "balance_sheet"
        ? target.id !== source.id
        : target.account_type !== expected) ||
      policy.kind === "conversion" ||
      !policy.policyNote.trim() ||
      !policy.evidenceReference.trim() ||
      !policy.approvedBy ||
      !policy.approvedAt ||
      !isReportDate(policy.effectiveFrom) ||
      (policy.effectiveTo && !isReportDate(policy.effectiveTo)) ||
      (policy.kind === "balance_sheet"
        ? !["asset", "liability", "equity"].includes(source.account_type)
        : policy.kind === "inventory" || policy.kind === "prepaid"
          ? source.account_type !== "asset"
          : source.account_type !== "liability")
    )
      return fail(
        "The approved cash classification does not match its source and recognition account types or approval evidence.",
        ["Valid approved source and recognition accounts, policy note and evidence reference"],
        journal,
        accountId,
        amount,
        documentId,
      );
    const evidence = policy.evidenceJournalIds.map((id) => journals.get(id));
    if (
      !evidence.length ||
      new Set(policy.evidenceJournalIds).size !== evidence.length ||
      evidence.some(
        (j) =>
          !j ||
          j.companyId !== input.companyId ||
          j.date > date ||
          !cashEvidenceMatches(
            j,
            policy.evidenceJournalSnapshots.find((s) => s.id === j.id),
          ) ||
          !j.lines.some((line) => line.accountId === accountId && line.debit !== line.credit),
      )
    )
      return fail(
        "The approved cash classification has no matching posted source transaction evidence.",
        [
          "Available posted supporting journals for this source account, dated no later than recognition",
        ],
        journal,
        accountId,
        amount,
        documentId,
      );
    if (policy.kind.startsWith("payroll_")) {
      // Liability settlement alone does not establish payroll expense. A posted
      // accrual or gross-pay posting must independently evidence the selected
      // wage/tax/deduction split. Gross-pay cash journals establish withheld
      // liabilities; they are not themselves payments of those liabilities.
      const support = evidence.filter((j): j is CashJournal =>
        Boolean(
          j &&
          (j.sourceType === "opening_balance" ||
            j.lines.some(
              (l) => l.accountId === policy.recognitionAccountId && l.debit !== l.credit,
            )),
        ),
      );
      const sourceNet = (j: CashJournal) =>
        j.lines.reduce((sum, l) => sum + (l.accountId === accountId ? l.credit - l.debit : 0n), 0n);
      const relevant = input.journals.filter(
        (j) =>
          j.date <= date && j.lines.some((l) => l.accountId === accountId && l.debit !== l.credit),
      );
      const nonCash = relevant.filter(
        (j) => !j.lines.some((l) => input.cashAccountIds.includes(l.accountId)),
      );
      const paid = relevant
        .filter(
          (j) =>
            j.lines.some((l) => input.cashAccountIds.includes(l.accountId)) &&
            !support.some((s) => s.id === j.id),
        )
        .reduce((sum, j) => sum - sourceNet(j), 0n);
      const accrued = support.reduce((sum, j) => sum + sourceNet(j), 0n);
      const sharedSources = new Set(
        policies
          .filter(
            (p) =>
              p.status === "approved" &&
              p.companyId === input.companyId &&
              p.kind.startsWith("payroll_") &&
              p.recognitionAccountId === policy.recognitionAccountId &&
              p.effectiveFrom <= date &&
              (!p.effectiveTo || p.effectiveTo >= date),
          )
          .map((p) => p.sourceAccountId),
      );
      const invalidSplit = support.some((j) => {
        if (j.sourceType === "opening_balance") return false;
        const expense = j.lines.reduce(
          (sum, l) => sum + (l.accountId === policy.recognitionAccountId ? l.debit - l.credit : 0n),
          0n,
        );
        const liabilities = j.lines.reduce(
          (sum, l) => sum + (sharedSources.has(l.accountId) ? l.credit - l.debit : 0n),
          0n,
        );
        return expense >= 0n ? liabilities > expense : liabilities < expense;
      });
      if (
        !support.length ||
        nonCash.some((j) => !support.some((s) => s.id === j.id)) ||
        relevant.some((j) => j.currency !== journal.currency) ||
        accrued < 0n ||
        paid < 0n ||
        paid > accrued ||
        invalidSplit
      )
        return fail(
          "Payroll cash classification needs the posted payroll accrual and the independently supported liability component.",
          [
            "Complete posted payroll expense/liability history, independently supported component splits, and payments not exceeding that accrual",
          ],
          journal,
          accountId,
          amount,
          documentId,
        );
    }
    return target.id;
  }

  function conversion(accountId: string, journal: CashJournal, amount: bigint): string {
    const policy = policies
      .filter(
        (p) =>
          p.companyId === input.companyId &&
          p.sourceAccountId === accountId &&
          p.kind === "conversion" &&
          p.status === "approved" &&
          p.effectiveFrom <= journal.date &&
          (!p.effectiveTo || p.effectiveTo >= journal.date),
      )
      .sort((a, b) => b.version - a.version)[0];
    const account = accounts.get(accountId)!;
    if (!policy && !["income", "expense"].includes(account.account_type)) return accountId;
    if (
      !policy ||
      accounts.get(policy.recognitionAccountId)?.account_type !== "equity" ||
      !policy.policyNote.trim() ||
      !policy.evidenceReference.trim() ||
      !policy.approvedAt ||
      !policy.approvedBy ||
      !policy.evidenceJournalIds.includes(journal.id) ||
      !cashEvidenceMatches(
        journal,
        policy.evidenceJournalSnapshots.find((s) => s.id === journal.id),
      )
    )
      return fail(
        "Opening conversion income and expenses require a verified opening-equity classification; conversion entries are excluded from current-period P&L.",
        ["Approved conversion policy and immutable posted opening journal evidence"],
        journal,
        accountId,
        amount,
      );
    return policy.recognitionAccountId;
  }

  const opening = new Map<string, CashOpeningEvidence>();
  for (const item of input.openingEvidence ?? []) {
    if (item.companyId !== input.companyId) throw new Error("Cross-company opening cash evidence");
    if (item.sourceJournalSnapshot?.journal_date > period.to) continue;
    if (
      item.status !== "approved" ||
      item.effectiveFrom > period.to ||
      (item.effectiveTo && item.effectiveTo < period.from)
    )
      continue;
    const old = opening.get(item.documentId);
    if (!old || old.version < item.version) opening.set(item.documentId, item);
  }
  function openingSource(documentId: string): CashJournal | undefined {
    const item = opening.get(documentId);
    if (!item) return undefined;
    const journal = journals.get(item.postedJournalId);
    if (!journal)
      throw new Error("Approved opening evidence references an unavailable posted journal");
    const control = accounts.get(item.controlAccountId);
    const equity = accounts.get(item.equityAccountId);
    const sign = item.sourceKind === "sales_invoice" ? 1n : -1n;
    const gross = journal.lines.reduce(
      (n, l) => n + (l.accountId === item.controlAccountId ? (l.debit - l.credit) * sign : 0n),
      0n,
    );
    const peers = [...opening.values()].filter(
      (p) => p.postedJournalId === journal.id && p.controlAccountId === item.controlAccountId,
    );
    const allocated = peers.reduce((n, p) => n + p.grossMinor, 0n);
    if (
      journal.sourceType !== "opening_balance" ||
      journal.companyId !== input.companyId ||
      item.currency !== journal.currency ||
      control?.account_type !== (sign === 1n ? "asset" : "liability") ||
      equity?.account_type !== "equity" ||
      item.grossMinor <= 0n ||
      allocated > gross ||
      !journal.lines.some((l) => l.accountId === item.equityAccountId) ||
      !cashEvidenceMatches(journal, item.sourceJournalSnapshot) ||
      item.effectiveFrom > journal.date ||
      !item.components.length ||
      item.components.some((c) => c.amountMinor <= 0n || !accounts.has(c.accountId)) ||
      item.components.reduce((n, c) => n + c.amountMinor, 0n) !== item.grossMinor ||
      !item.approvedAt ||
      !item.approvedBy ||
      !item.policyNote.trim() ||
      !item.evidenceReference.trim()
    )
      return fail(
        "Imported opening balances need verified document components and matching posted control/equity evidence.",
        [
          "Approved opening document split reconciling gross, currency, posted control and equity balances",
        ],
        journal,
        item.controlAccountId,
        item.grossMinor,
        documentId,
      );
    return {
      ...journal,
      sourceType: item.sourceKind,
      sourceId: documentId,
      lines: [
        {
          accountId: item.controlAccountId,
          debit: sign > 0n ? item.grossMinor : 0n,
          credit: sign < 0n ? item.grossMinor : 0n,
        },
        ...item.components.map((component) => ({
          accountId: component.accountId,
          debit: sign < 0n ? component.amountMinor : 0n,
          credit: sign > 0n ? component.amountMinor : 0n,
        })),
      ],
    };
  }
  return { accounts, journals, fail, needsPolicy, classify, conversion, opening, openingSource };
}
