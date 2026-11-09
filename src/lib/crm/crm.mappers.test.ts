import { describe, expect, it } from "vitest";
import { mapCrmDashboardKpis, mapCrmLead, mapCrmSettings } from "@/lib/crm/mappers";
import { displayLeadName } from "@/lib/crm/types";
import { formatCrmMinor } from "@/lib/crm/format";

describe("CRM mappers", () => {
  it("maps settings from camelCase RPC payload", () => {
    const settings = mapCrmSettings({
      companyId: "11111111-1111-1111-1111-111111111111",
      enabled: true,
      leadNumberPrefix: "L-",
      opportunityNumberPrefix: "O-",
      staleDealDays: 45,
      defaultPipelineId: null,
      version: 2,
      updatedAt: "2026-11-09T00:00:00Z",
    });
    expect(settings.enabled).toBe(true);
    expect(settings.staleDealDays).toBe(45);
    expect(settings.leadNumberPrefix).toBe("L-");
  });

  it("maps lead rows and display names", () => {
    const lead = mapCrmLead({
      id: "22222222-2222-2222-2222-222222222222",
      lead_number: "LEAD-0001",
      status: "new",
      person_type: "business",
      first_name: "Ada",
      last_name: "Lovelace",
      organization_name: "Analytical Engines",
      email: "ada@example.com",
      estimated_value_minor: 125000,
      currency_code: "GBP",
      score: 10,
      tags: ["enterprise"],
      created_at: "2026-11-09T00:00:00Z",
      updated_at: "2026-11-09T00:00:00Z",
    });
    expect(displayLeadName(lead)).toBe("Analytical Engines");
    expect(lead.estimatedValueMinor).toBe(125000);
  });

  it("treats weighted pipeline as CRM expectation, not blank", () => {
    const kpis = mapCrmDashboardKpis({
      totalLeads: 3,
      weightedPipelineValueMinor: 50000,
      winRatePct: 40,
      note: "Pipeline and forecast figures are CRM expectations, not posted accounting revenue.",
    });
    expect(kpis.totalLeads).toBe(3);
    expect(kpis.weightedPipelineValueMinor).toBe(50000);
    expect(kpis.note).toMatch(/not posted accounting revenue/i);
  });

  it("formats minor units", () => {
    expect(formatCrmMinor(19900, "USD")).toContain("199");
  });
});
