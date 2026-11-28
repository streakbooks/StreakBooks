export type CommissionTier = { uptoMinor: number; rateBps: number };

export type CommissionShare = { partyId: string; amountMinor: number };

export function commissionGrossMinor(
  baseMinor: number,
  fixedMinor: number,
  rateBps: number,
  tiers?: readonly CommissionTier[],
): number {
  if (!Number.isSafeInteger(baseMinor) || baseMinor < 0) {
    throw new Error("Commission base must be a non-negative minor amount.");
  }
  if (!Number.isSafeInteger(fixedMinor) || fixedMinor < 0) {
    throw new Error("Fixed commission must be a non-negative minor amount.");
  }
  if (!tiers || tiers.length === 0) {
    if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) {
      throw new Error("Commission rate must be between 0 and 100%.");
    }
    return fixedMinor + Math.floor((baseMinor * rateBps) / 10000);
  }
  const ordered = [...tiers].sort((a, b) => a.uptoMinor - b.uptoMinor);
  let gross = fixedMinor;
  let previous = 0;
  let covered = 0;
  for (const tier of ordered) {
    if (!Number.isInteger(tier.rateBps) || tier.rateBps < 0 || tier.rateBps > 10000) {
      throw new Error("Tier rate must be between 0 and 100%.");
    }
    if (tier.uptoMinor <= previous) throw new Error("Commission tiers must increase.");
    const slice = Math.min(baseMinor, tier.uptoMinor) - previous;
    if (slice > 0) {
      gross += Math.floor((slice * tier.rateBps) / 10000);
      covered += slice;
    }
    previous = tier.uptoMinor;
    if (covered >= baseMinor) break;
  }
  if (covered < baseMinor) throw new Error("Commission tiers do not cover the base amount.");
  return gross;
}

export function allocateByBps(
  totalMinor: number,
  parts: readonly { id: string; bps: number }[],
): { id: string; amountMinor: number }[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) {
    throw new Error("Amount to share must be a non-negative minor amount.");
  }
  if (parts.length === 0) throw new Error("At least one share is required.");
  const bps = parts.reduce((sum, part) => sum + part.bps, 0);
  if (bps !== 10000) throw new Error("Shares must total 100%.");
  const raw = parts.map((part, index) => {
    const exact = (totalMinor * part.bps) / 10000;
    const floor = Math.floor(exact);
    return { id: part.id, index, floor, fraction: exact - floor };
  });
  let remainder = totalMinor - raw.reduce((sum, part) => sum + part.floor, 0);
  const order = [...raw].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const extra = new Map<string, number>();
  for (const part of order) {
    if (remainder <= 0) break;
    extra.set(part.id, (extra.get(part.id) ?? 0) + 1);
    remainder -= 1;
  }
  return raw.map((part) => ({
    id: part.id,
    amountMinor: part.floor + (extra.get(part.id) ?? 0),
  }));
}

export function splitCommission(input: {
  baseMinor: number;
  fixedMinor?: number;
  rateBps?: number;
  tiers?: readonly CommissionTier[];
  withholdingBps?: number;
  shares: readonly { id: string; bps: number }[];
}): { grossMinor: number; withholdingMinor: number; netMinor: number; shares: CommissionShare[] } {
  const grossMinor = commissionGrossMinor(
    input.baseMinor,
    input.fixedMinor ?? 0,
    input.rateBps ?? 0,
    input.tiers,
  );
  const withholdingBps = input.withholdingBps ?? 0;
  if (!Number.isInteger(withholdingBps) || withholdingBps < 0 || withholdingBps > 10000) {
    throw new Error("Withholding must be between 0 and 100%.");
  }
  const withholdingMinor = Math.floor((grossMinor * withholdingBps) / 10000);
  const netMinor = grossMinor - withholdingMinor;
  const shares = allocateByBps(netMinor, input.shares).map((share) => ({
    partyId: share.id,
    amountMinor: share.amountMinor,
  }));
  return { grossMinor, withholdingMinor, netMinor, shares };
}
