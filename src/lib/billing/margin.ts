export type CostInput = {
  key: string;
  unitCostMinorUsd: number;
  typicalQuantity: number;
  maxQuantity: number;
};

export type MarginResult = {
  priceMinorUsd: number;
  typicalCostMinor: number;
  maxCostMinor: number;
  typicalMarginBps: number;
  maxMarginBps: number;
  belowTypicalFloor: boolean;
  belowMaxFloor: boolean;
};

const TYPICAL_FLOOR_BPS = 7000;
const MAX_FLOOR_BPS = 4000;

export function planMargin(priceMinorUsd: number, costs: readonly CostInput[]): MarginResult {
  const typicalCostMinor = costs.reduce(
    (sum, row) => sum + row.unitCostMinorUsd * row.typicalQuantity,
    0,
  );
  const maxCostMinor = costs.reduce((sum, row) => sum + row.unitCostMinorUsd * row.maxQuantity, 0);
  const typicalMarginBps = marginBps(priceMinorUsd, typicalCostMinor);
  const maxMarginBps = marginBps(priceMinorUsd, maxCostMinor);
  return {
    priceMinorUsd,
    typicalCostMinor,
    maxCostMinor,
    typicalMarginBps,
    maxMarginBps,
    belowTypicalFloor: typicalMarginBps < TYPICAL_FLOOR_BPS,
    belowMaxFloor: maxMarginBps < MAX_FLOOR_BPS,
  };
}

function marginBps(price: number, cost: number): number {
  if (price <= 0) return 0;
  return Math.round(((price - cost) / price) * 10_000);
}
