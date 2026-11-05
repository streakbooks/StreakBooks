/**
 * Cash-basis allocation core shared by the server-side cash P&L engine.
 *
 * Caller must provide authenticated, organisation-scoped, posted source facts
 * including dated allocations and reversal/refund events. Non-cash credits are
 * deliberately not recognised as receipts/payments. Unsupported allocation history,
 * inventory/COGS and opening-balance sources require verified source classification.
 *
 * All amounts are transaction-currency minor units (bigint). A settlement's
 * recognised net and tax components add to its exact cash delta. FX rounding
 * is returned explicitly; the cash P&L caller apportions actual base cash to reconcile it.
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
  /** A dated void/unapplication returns the exact component slices of this settlement. */
  reversesSettlementId?: string;
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

export function apportionCashAmount(
  cumulative: bigint,
  weights: bigint[],
  total: bigint,
): bigint[] {
  if (
    total <= 0n ||
    cumulative < 0n ||
    weights.length === 0 ||
    weights.some((weight) => weight < 0n) ||
    weights.reduce((sum, weight) => sum + weight, 0n) !== total
  )
    throw new Error("Invalid cash apportionment totals");
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

/** Highest-averages cumulative allocation is house-monotone: adding a penny
 * cannot remove a penny previously recognized on another account. Largest
 * remainder, although appropriate for a single split, has the Alabama paradox
 * when recalculated for consecutive partial payments. Jefferson's lower-quota
 * property lets us start at proportional floors and assign fewer than n extras,
 * so runtime depends on component count, never the size of the monetary amount.
 */
export function apportionCumulativeCash(
  cumulative: bigint,
  weights: bigint[],
  total: bigint,
): bigint[] {
  // Reuse the public single-split validation without floating point arithmetic.
  apportionCashAmount(0n, weights, total);
  if (cumulative < 0n) throw new Error("Invalid cash apportionment totals");
  const shares = weights.map((weight) => (cumulative * weight) / total);
  const extras = cumulative - shares.reduce((sum, value) => sum + value, 0n);
  for (let remaining = extras; remaining > 0n; remaining--) {
    let best = 0;
    for (let index = 1; index < weights.length; index++) {
      if (weights[index]! * (shares[best]! + 1n) > weights[best]! * (shares[index]! + 1n))
        best = index;
    }
    shares[best] = shares[best]! + 1n;
  }
  return shares;
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
  type Slice = { from: bigint; to: bigint };
  let free: Slice[] = [{ from: 0n, to: source.totalMinor }];
  const held = new Map<string, Slice[]>();
  function release(slices: Slice[]) {
    free.push(...slices);
    free.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    const merged: Slice[] = [];
    for (const slice of free) {
      const previous = merged.at(-1);
      if (previous?.to === slice.from) previous.to = slice.to;
      else merged.push({ ...slice });
    }
    free = merged;
  }
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
    const slices: Slice[] = [];
    if (settlement.cashDeltaMinor > 0n) {
      if (settlement.reversesSettlementId)
        throw new Error("A cash reversal must have a negative amount");
      let remaining = settlement.cashDeltaMinor;
      while (remaining > 0n && free.length) {
        const first = free[0]!;
        const available = first.to - first.from;
        const used = remaining < available ? remaining : available;
        slices.push({ from: first.from, to: first.from + used });
        first.from += used;
        remaining -= used;
        if (first.from === first.to) free.shift();
      }
      if (remaining > 0n) throw new Error("Cash settlement exceeds available source components");
      held.set(
        settlement.id,
        slices.map((slice) => ({ ...slice })),
      );
    } else if (settlement.reversesSettlementId) {
      const original = held.get(settlement.reversesSettlementId);
      if (
        !original ||
        original.reduce((sum, slice) => sum + slice.to - slice.from, 0n) !==
          -settlement.cashDeltaMinor
      )
        throw new Error("Cash reversal does not match an unreversed original settlement");
      slices.push(...original.map((slice) => ({ ...slice })));
      held.delete(settlement.reversesSettlementId);
      release(slices);
    } else {
      // A source-level refund without an original settlement identity returns
      // the latest occupied component slices. Named voids always use the exact
      // original slices above, including after later partial payments.
      let remaining = -settlement.cashDeltaMinor;
      const occupied = [...held]
        .flatMap(([id, rows]) => rows.map((slice) => ({ id, slice })))
        .sort((a, b) => (a.slice.to > b.slice.to ? -1 : a.slice.to < b.slice.to ? 1 : 0));
      for (const { slice } of occupied) {
        if (remaining === 0n) break;
        const available = slice.to - slice.from;
        const used = remaining < available ? remaining : available;
        slices.push({ from: slice.to - used, to: slice.to });
        slice.to -= used;
        remaining -= used;
      }
      if (remaining > 0n) throw new Error("Cash refund exceeds recognized source components");
      for (const [id, rows] of held)
        held.set(
          id,
          rows.filter((slice) => slice.from < slice.to),
        );
      release(slices);
    }
    const delta = weights.map(() => 0n);
    for (const slice of slices) {
      const before = apportionCumulativeCash(slice.from, weights, source.totalMinor);
      const after = apportionCumulativeCash(slice.to, weights, source.totalMinor);
      for (const index of delta.keys())
        delta[index] =
          delta[index]! +
          (after[index]! - before[index]!) * (settlement.cashDeltaMinor < 0n ? -1n : 1n);
    }
    const pieces = source.components.map((component, index) => {
      const recognisedMinor = delta[index]!;
      if (
        (settlement.cashDeltaMinor > 0n && recognisedMinor < 0n) ||
        (settlement.cashDeltaMinor < 0n && recognisedMinor > 0n)
      ) {
        // A violation indicates inconsistent cumulative allocation state.
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
    cumulative = next;
  }
  return recognised;
}
