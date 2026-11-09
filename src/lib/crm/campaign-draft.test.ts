import { describe, expect, it } from "vitest";
import { validateCrmCampaignDraft } from "@/lib/crm/campaign-draft";

describe("validateCrmCampaignDraft", () => {
  it("accepts a planned campaign", () => {
    expect(
      validateCrmCampaignDraft({
        name: "Spring outreach",
        status: "planned",
        budgetMinor: 50000,
        currencyCode: "usd",
        startsOn: "2026-03-01",
        endsOn: "2026-03-31",
      }),
    ).toBeNull();
  });

  it("rejects empty names and inverted dates", () => {
    expect(
      validateCrmCampaignDraft({
        name: " ",
        status: "active",
        budgetMinor: 0,
        currencyCode: "USD",
      }),
    ).toMatch(/name/i);
    expect(
      validateCrmCampaignDraft({
        name: "X",
        status: "active",
        budgetMinor: 0,
        currencyCode: "USD",
        startsOn: "2026-04-01",
        endsOn: "2026-03-01",
      }),
    ).toMatch(/end date/i);
  });
});
