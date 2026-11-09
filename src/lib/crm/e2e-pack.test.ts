import { describe, expect, it } from "vitest";
import {
  CRM_E2E_CASES,
  assertCrmE2ePackComplete,
  crmE2eCaseIds,
} from "@/lib/crm/e2e-pack";
import { resolveCrmCommsPolicy } from "@/lib/crm/comms-policy";
import { resolveCrmAutomationPolicy } from "@/lib/crm/automation-policy";
import { resolveCrmImportExportPolicy } from "@/lib/crm/import-export-policy";
import { buildForecastReport } from "@/lib/crm/forecast-report";
import { resolveCrmTerritoryPolicy } from "@/lib/crm/territory-policy";

describe("CRM E2E pack contracts", () => {
  it("defines exactly five required acceptance cases", () => {
    expect(CRM_E2E_CASES).toHaveLength(5);
    expect(assertCrmE2ePackComplete(crmE2eCaseIds())).toBeNull();
  });

  it("keeps unauthorized side-effect surfaces fail-closed", () => {
    expect(resolveCrmCommsPolicy().canSend).toBe(false);
    expect(resolveCrmAutomationPolicy().canRun).toBe(false);
    expect(resolveCrmImportExportPolicy({ hasImportPermission: true }).canImport).toBe(false);
    expect(resolveCrmTerritoryPolicy().canManageTerritories).toBe(false);
  });

  it("weights only open opportunities for stage-move forecast contract", () => {
    const report = buildForecastReport({
      stages: [
        {
          id: "s1",
          name: "Proposal",
          sortOrder: 10,
          probabilityPct: 40,
          isWon: false,
          isLost: false,
          isActive: true,
        },
      ],
      opportunities: [
        {
          id: "o1",
          stageId: "s1",
          amountMinor: 10000,
          probabilityPct: 40,
          status: "open",
        },
        {
          id: "o2",
          stageId: "s1",
          amountMinor: 10000,
          probabilityPct: 40,
          status: "won",
        },
      ],
    });
    expect(report.openDealCount).toBe(1);
    expect(report.weightedPipelineValueMinor).toBe(4000);
  });
});
