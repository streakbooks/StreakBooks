/**
 * Cash-basis recognition core. This is NOT an enabled report basis.
 *
 * Caller must provide authenticated, organisation-scoped, posted source facts
 * including dated allocations and reversal/refund events. Non-cash credits are
 * deliberately not recognised as receipts/payments. The reporting RPC, FX
 * reconciliation, inventory/COGS and opening-balance coverage are release gates.
 *
 * All amounts are transaction-currency minor units (bigint). A settlement's
 * recognised net and tax components add to its exact cash delta. FX rounding
 * is returned explicitly; a caller must reconcile/post it, never discard it.
 */
import { convertMinorToBase } from "@/lib/accounting/fx";
import { isReportDate } from "./date-validation";

export type CashComponent = {
  accountId: string;
  kind: "net" | "tax";
  amountMinor: bigint;
};
export type CashSettlement = {
  id: string;
  companyId: string;
  documentId: string;
  settledOn: string;
  /** Positive receipt/payment, negative refund/reversal of earlier cash. */
  cashDeltaMinor: bigint;
  /** Original posted settlement rate, not a current market quote. */
  fxRateToBase: string;
  /** Same-day ordering from the immutable source ledger. */
  sequence: number;
  status: "posted" | "void";
};
export type CashSourceDocument = {
  id: string;
  companyId: string;
  status: "posted" | "draft" | "void";
  currencyCode: string;
  baseCurrencyCode: string;
  totalMinor: bigint;
  /** Applied credits are non-cash; they cap total permissible cash settlement. */
  nonCashCreditMinor: bigint;
  components: CashComponent[];
  settlements: CashSettlement[];
};
export type CashRecognition = {
  settlementId: string;
  settledOn: string;
  cashDeltaMinor: bigint;
  cashBaseMinor: bigint;
  /** Base-currency residual between independently rounded components and cash. */
  fxRoundingBaseMinor: bigint;
  components: Array<CashComponent & { recognisedMinor: bigint; recognisedBaseMinor: bigint }>;
};

function apportion(cumulative: bigint, weights: bigint[], total: bigint): bigint[] {
  const shares = weights.map((weight, index) => ({
    index,
    whole: (cumulative * weight) / total,
    remainder: (cumulative * weight) % total,
  }));
  const allocated = shares.reduce((sum, share) => sum + share.whole, 0n);
  const extras = cumulative - allocated;
  // Largest-remainder distribution ensures every penny is assigned once.
  const ranked = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (let i = 0; i < Number(extras); i++) ranked[i]!.whole++;
  return shares.map((share) => share.whole);
}

function assertRate(rate: string) {
  if (!/^\d{1,12}(\.\d{1,12})?$/.test(rate) || !/[1-9]/.test(rate)) {
    throw new Error("Cash settlement requires a positive posted FX rate");
  }
}

export function recogniseCashSettlements(
  source: CashSourceDocument,
  period: { from: string; to: string },
): CashRecognition[] {
  if (!isReportDate(period.from) || !isReportDate(period.to) || period.from > period.to) {
    throw new Error("Cash recognition requires a valid reporting period");
  }
  if (!source.companyId || !source.id || source.status !== "posted") {
    throw new Error("Cash recognition requires a posted, non-void source document");
  }
  if (!/^[A-Z]{3}$/.test(source.currencyCode) || !/^[A-Z]{3}$/.test(source.baseCurrencyCode)) {
    throw new Error("Cash recognition requires valid currency codes");
  }
  if (
    source.totalMinor <= 0n ||
    source.nonCashCreditMinor < 0n ||
    source.nonCashCreditMinor > source.totalMinor ||
    source.components.length === 0 ||
    source.components.length > 1000 ||
    source.settlements.length > 10000
  ) {
    throw new Error("Invalid cash source totals or source size");
  }
  const weights = source.components.map((component) => {
    if (!component.accountId || component.amountMinor < 0n) {
      throw new Error("Invalid cash source account or component amount");
    }
    return component.amountMinor;
  });
  if (weights.reduce((sum, n) => sum + n, 0n) !== source.totalMinor) {
    throw new Error("Cash source components do not reconcile to document gross");
  }
  const ordered = [...source.settlements].sort(
    (a, b) =>
      a.settledOn.localeCompare(b.settledOn) || a.sequence - b.sequence || a.id.localeCompare(b.id),
  );
  let cumulative = 0n;
  let before = weights.map(() => 0n);
  const seen = new Set<string>();
  const recognised: CashRecognition[] = [];
  for (const settlement of ordered) {
    if (!settlement.id || seen.has(settlement.id)) {
      throw new Error("Duplicate or missing settlement identity");
    }
    seen.add(settlement.id);
    if (settlement.companyId !== source.companyId || settlement.documentId !== source.id) {
      throw new Error("Cross-organisation or mismatched cash settlement");
    }
    if (
      !isReportDate(settlement.settledOn) ||
      !Number.isSafeInteger(settlement.sequence) ||
      settlement.sequence < 0 ||
      settlement.cashDeltaMinor === 0n
    ) {
      throw new Error("Invalid cash settlement date, sequence or amount");
    }
    if (settlement.settledOn > period.to) continue;
    if (settlement.status !== "posted") {
      // A voided receipt may have a separately dated reversal. Never erase
      // the historical cash movement by filtering its current status.
      throw new Error("Voided cash settlement requires verified reversal history");
    }
    assertRate(settlement.fxRateToBase);
    if (
      source.currencyCode === source.baseCurrencyCode &&
      !/^0*1(?:\.0+)?$/.test(settlement.fxRateToBase)
    ) {
      throw new Error("Base-currency settlement must use FX rate 1");
    }
    const next = cumulative + settlement.cashDeltaMinor;
    if (next < 0n || next > source.totalMinor - source.nonCashCreditMinor) {
      throw new Error("Cash settlement exceeds uncredited document balance");
    }
    const after = apportion(next, weights, source.totalMinor);
    const pieces = source.components.map((component, index) => {
      const recognisedMinor = after[index]! - before[index]!;
      if (
        (settlement.cashDeltaMinor > 0n && recognisedMinor < 0n) ||
        (settlement.cashDeltaMinor < 0n && recognisedMinor > 0n)
      ) {
        // Rare largest-remainder paradox: do not report negative revenue on
        // a receipt or positive revenue on a refund; require review.
        throw new Error("Cash allocation rounding requires manual reconciliation");
      }
      return {
        ...component,
        recognisedMinor,
        recognisedBaseMinor: convertMinorToBase(
          recognisedMinor,
          settlement.fxRateToBase,
          source.currencyCode,
          source.baseCurrencyCode,
        ),
      };
    });
    const sum = pieces.reduce((value, item) => value + item.recognisedMinor, 0n);
    if (sum !== settlement.cashDeltaMinor) {
      throw new Error("Cash allocation does not reconcile to settlement");
    }
    const cashBaseMinor = convertMinorToBase(
      settlement.cashDeltaMinor,
      settlement.fxRateToBase,
      source.currencyCode,
      source.baseCurrencyCode,
    );
    const fxRoundingBaseMinor =
      cashBaseMinor - pieces.reduce((value, item) => value + item.recognisedBaseMinor, 0n);
    if (settlement.settledOn >= period.from) {
      recognised.push({
        settlementId: settlement.id,
        settledOn: settlement.settledOn,
        cashDeltaMinor: settlement.cashDeltaMinor,
        cashBaseMinor,
        fxRoundingBaseMinor,
        components: pieces,
      });
    }
    before = after;
    cumulative = next;
  }
  return recognised;
}
