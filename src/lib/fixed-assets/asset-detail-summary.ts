/** Presentation-only fixed-asset summary, never a substitute for the posted GL. */
export type AssetDetailHistory = {
  cost_minor: number | string | bigint;
  residual_minor: number | string | bigint;
  opening_accumulated_minor: number | string | bigint;
  status: "active" | "disposed";
};
export type AssetDetailCharge = { amount_minor: number | string | bigint };

export type AssetDetailSummary = {
  costMinor: string | null;
  postedChargesMinor: string | null;
  recordedAccumulatedMinor: string | null;
  remainingBeforeDisposalMinor: string | null;
  issue: string | null;
};

function exact(value: number | string | bigint, label: string): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(label + " has lost minor-unit precision.");
  }
  if (typeof value === "string" && !/^-?\d+$/.test(value)) {
    throw new Error(label + " must be a whole minor-unit amount.");
  }
  return BigInt(value);
}

export function summarizeAssetDetailHistory(
  asset: AssetDetailHistory,
  entries: readonly AssetDetailCharge[],
): AssetDetailSummary {
  try {
    const cost = exact(asset.cost_minor, "Asset cost");
    const residual = exact(asset.residual_minor, "Asset residual value");
    const opening = exact(asset.opening_accumulated_minor, "Opening depreciation");
    if (cost <= 0n || residual < 0n || opening < 0n || residual + opening > cost) {
      throw new Error("Asset cost, residual value or opening depreciation is inconsistent.");
    }
    let posted = 0n;
    for (const entry of entries) {
      const amount = exact(entry.amount_minor, "Posted depreciation");
      if (amount <= 0n) throw new Error("Posted depreciation must be positive.");
      posted += amount;
    }
    const accumulated = opening + posted;
    if (accumulated > cost - residual) {
      throw new Error(
        "Recorded depreciation exceeds the asset's depreciable cost after residual value.",
      );
    }
    return {
      costMinor: cost.toString(),
      postedChargesMinor: posted.toString(),
      recordedAccumulatedMinor: accumulated.toString(),
      // Disposal journals clear the book balance; this is not today's book value.
      remainingBeforeDisposalMinor:
        asset.status === "active" ? (cost - accumulated).toString() : null,
      issue: null,
    };
  } catch (error) {
    return {
      costMinor: null,
      postedChargesMinor: null,
      recordedAccumulatedMinor: null,
      remainingBeforeDisposalMinor: null,
      issue: error instanceof Error ? error.message : "Asset summary unavailable.",
    };
  }
}
