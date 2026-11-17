/** Pure CRM forecast aggregation — labelled pipeline expectation, not GL revenue. */

export type ForecastOppInput = {
  id: string;
  stageId: string;
  amountMinor: number;
  probabilityPct: number;
  status: string;
};

export type ForecastStageInput = {
  id: string;
  name: string;
  sortOrder: number;
  probabilityPct: number;
  isWon: boolean;
  isLost: boolean;
  isActive: boolean;
};

export type ForecastStageRow = {
  stageId: string;
  stageName: string;
  dealCount: number;
  amountMinor: number;
  weightedMinor: number;
  probabilityPct: number;
};

export type ForecastReport = {
  openDealCount: number;
  pipelineValueMinor: number;
  weightedPipelineValueMinor: number;
  stages: ForecastStageRow[];
  note: string;
};

export const FORECAST_NOT_GL_NOTE =
  "Weighted pipeline is a CRM forecast expectation. It is not posted accounting revenue.";

export function buildForecastReport(input: {
  opportunities: ForecastOppInput[];
  stages: ForecastStageInput[];
}): ForecastReport {
  const open = input.opportunities.filter((o) => o.status === "open");
  const stageMeta = new Map(input.stages.map((s) => [s.id, s]));
  const buckets = new Map<string, ForecastStageRow>();

  for (const stage of [...input.stages].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!stage.isActive) continue;
    buckets.set(stage.id, {
      stageId: stage.id,
      stageName: stage.name,
      dealCount: 0,
      amountMinor: 0,
      weightedMinor: 0,
      probabilityPct: stage.probabilityPct,
    });
  }

  let pipelineValueMinor = 0;
  let weightedPipelineValueMinor = 0;

  for (const opp of open) {
    const amount = Math.max(0, Math.trunc(opp.amountMinor));
    const meta = stageMeta.get(opp.stageId);
    const probability =
      typeof opp.probabilityPct === "number"
        ? Math.min(100, Math.max(0, Math.trunc(opp.probabilityPct)))
        : (meta?.probabilityPct ?? 0);
    const weighted = Math.round((amount * probability) / 100);
    pipelineValueMinor += amount;
    weightedPipelineValueMinor += weighted;

    let row = buckets.get(opp.stageId);
    if (!row) {
      row = {
        stageId: opp.stageId,
        stageName: meta?.name ?? "Unknown stage",
        dealCount: 0,
        amountMinor: 0,
        weightedMinor: 0,
        probabilityPct: probability,
      };
      buckets.set(opp.stageId, row);
    }
    row.dealCount += 1;
    row.amountMinor += amount;
    row.weightedMinor += weighted;
  }

  return {
    openDealCount: open.length,
    pipelineValueMinor,
    weightedPipelineValueMinor,
    stages: [...buckets.values()],
    note: FORECAST_NOT_GL_NOTE,
  };
}
