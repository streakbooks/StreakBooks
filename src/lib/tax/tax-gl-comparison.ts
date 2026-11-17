import type { PostedLine } from "@/lib/accounting/reporting";

/**
 * Read-only GL activity diagnostic; not a statutory return certification.
 * Output control = credits - debits; input control = debits - credits.
 * Reversals are shown separately from original document postings.
 */
const DOCUMENT_TYPES = new Set([
  "sales_invoice",
  "sales_credit_note",
  "purchase_bill",
  "purchase_credit_note",
  "expense",
]);

export type ComparisonBasis = "accrual" | "cash";
export type GlBucket = {
  documentMinor: string;
  reversalMinor: string;
  otherMinor: string;
  totalMinor: string;
  returnMinor: string;
  documentAndReversalDifferenceMinor: string;
  journalLines: number;
};
export type TaxGlComparison = {
  basis: ComparisonBasis;
  output: GlBucket;
  input: GlBucket;
  journalLines: number;
  netReturnMinor: string;
  netDocumentAndReversalMinor: string;
  netAllGlMinor: string;
  netDiagnosticDifferenceMinor: string;
  comparisonAvailable: boolean;
  warnings: string[];
};

/** Serialize exact BigInt minor-unit values to strings for server/client transport. */
export function compareTaxReturnWithGl(args: {
  basis: ComparisonBasis;
  outputAccountId: string;
  inputAccountId: string;
  outputReturnMinor: number;
  inputReturnMinor: number;
  lines: readonly Pick<PostedLine, "account_id" | "debit_minor" | "credit_minor" | "source_type">[];
}): TaxGlComparison {
  if (
    !args.outputAccountId ||
    !args.inputAccountId ||
    args.outputAccountId === args.inputAccountId
  ) {
    throw new Error("Choose two distinct tax control accounts for GL comparison.");
  }
  for (const [label, value] of [
    ["Output tax", args.outputReturnMinor],
    ["Input tax", args.inputReturnMinor],
  ] as const) {
    if (!Number.isSafeInteger(value))
      throw new Error(`${label} is not a safe integer minor-unit amount.`);
  }

  type Group = { document: bigint; reversal: bigint; other: bigint; count: number };
  const out: Group = { document: 0n, reversal: 0n, other: 0n, count: 0 };
  const inc: Group = { document: 0n, reversal: 0n, other: 0n, count: 0 };

  for (const line of args.lines) {
    const group =
      line.account_id === args.outputAccountId
        ? out
        : line.account_id === args.inputAccountId
          ? inc
          : null;
    if (!group) continue;
    const d = BigInt(line.debit_minor);
    const c = BigInt(line.credit_minor);
    const movement = group === out ? c - d : d - c;
    const bucket =
      line.source_type === "reversal"
        ? "reversal"
        : DOCUMENT_TYPES.has(line.source_type ?? "")
          ? "document"
          : "other";
    group[bucket] += movement;
    group.count += 1;
  }

  const build = (g: Group, returnValue: number): GlBucket => {
    const total = g.document + g.reversal + g.other;
    const difference = g.document + g.reversal - BigInt(returnValue);
    return {
      documentMinor: g.document.toString(),
      reversalMinor: g.reversal.toString(),
      otherMinor: g.other.toString(),
      totalMinor: total.toString(),
      returnMinor: BigInt(returnValue).toString(),
      documentAndReversalDifferenceMinor: difference.toString(),
      journalLines: g.count,
    };
  };

  const warnings = [
    "Journal movements are grouped by posting date and journal source; return tax is calculated from source documents.",
    "This diagnostic uses the organisation's mapped control accounts. Per-code overrides, fallback accounts and other tax accounts may cause differences.",
    "Settlement, tax adjustments, opening entries, payments and manual journals appear under Other activity, not return tax.",
    "Reversals are shown separately and included in the diagnostic variance.",
  ];
  if (args.basis === "cash") {
    warnings.unshift(
      "Cash-basis return amounts cannot be directly reconciled to accrual-dated GL postings. Any variance shown is informational only.",
    );
  }
  const output = build(out, args.outputReturnMinor);
  const input = build(inc, args.inputReturnMinor);
  const netReturn = BigInt(args.outputReturnMinor) - BigInt(args.inputReturnMinor);
  const netDocuments = out.document + out.reversal - inc.document - inc.reversal;
  const netAllGl =
    out.document + out.reversal + out.other - inc.document - inc.reversal - inc.other;
  return {
    basis: args.basis,
    output,
    input,
    netReturnMinor: netReturn.toString(),
    netDocumentAndReversalMinor: netDocuments.toString(),
    netAllGlMinor: netAllGl.toString(),
    netDiagnosticDifferenceMinor: (netDocuments - netReturn).toString(),
    journalLines: out.count + inc.count,
    comparisonAvailable: args.basis === "accrual",
    warnings,
  };
}
