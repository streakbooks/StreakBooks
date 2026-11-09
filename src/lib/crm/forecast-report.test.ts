import { describe, expect, it } from "vitest";
import { buildForecastReport, FORECAST_NOT_GL_NOTE } from "@/lib/crm/forecast-report";

describe("buildForecastReport", () => {
  it("weights open deals by probability and labels forecast as not GL", () => {
    const report = buildForecastReport({
      stages: [
        {
          id: "s1",
          name: "Proposal",
          sortOrder: 10,
          probabilityPct: 50,
          isWon: false,
          isLost: false,
          isActive: true,
        },
        {
          id: "s2",
          name: "Won",
          sortOrder: 20,
          probabilityPct: 100,
          isWon: true,
          isLost: false,
          isActive: true,
        },
      ],
      opportunities: [
        {
          id: "o1",
          stageId: "s1",
          amountMinor: 10000,
          probabilityPct: 50,
          status: "open",
        },
        {
          id: "o2",
          stageId: "s1",
          amountMinor: 4000,
          probabilityPct: 25,
          status: "won",
        },
      ],
    });
    expect(report.openDealCount).toBe(1);
    expect(report.pipelineValueMinor).toBe(10000);
    expect(report.weightedPipelineValueMinor).toBe(5000);
    expect(report.stages[0]?.dealCount).toBe(1);
    expect(report.note).toBe(FORECAST_NOT_GL_NOTE);
  });
});
