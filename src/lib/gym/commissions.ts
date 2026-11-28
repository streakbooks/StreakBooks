export type CommissionRule =
  | { kind: "fixed"; amountMinor: number }
  | { kind: "percent"; bps: number }
  | { kind: "tiered"; tiers: readonly { upToMinor: number | null; bps: number }[] };

function bpsOf(amountMinor: number, bps: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0)
    throw new Error("Commission basis is invalid");
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000)
    throw new Error("Commission rate is invalid");
  const product = amountMinor * bps;
  if (!Number.isSafeInteger(product))
    throw new Error("Commission is outside the safe integer range");
  return Math.floor(product / 10000);
}

/** Flat tier: the rate is the first tier whose ceiling covers the basis. A null ceiling is open-ended. */
export function commissionMinor(basisMinor: number, rule: CommissionRule): number {
  if (!Number.isSafeInteger(basisMinor) || basisMinor < 0)
    throw new Error("Commission basis is invalid");
  if (rule.kind === "fixed") {
    if (!Number.isSafeInteger(rule.amountMinor) || rule.amountMinor < 0) {
      throw new Error("Fixed commission is invalid");
    }
    return rule.amountMinor;
  }
  if (rule.kind === "percent") return bpsOf(basisMinor, rule.bps);
  if (rule.tiers.length === 0) throw new Error("Tiered commission needs at least one tier");
  for (const tier of rule.tiers) {
    if (tier.upToMinor !== null && (!Number.isSafeInteger(tier.upToMinor) || tier.upToMinor < 0)) {
      throw new Error("Commission tier ceiling is invalid");
    }
    if (tier.upToMinor === null || basisMinor <= tier.upToMinor) return bpsOf(basisMinor, tier.bps);
  }
  throw new Error("Commission basis is above every tier");
}
