import { describe, expect, it } from "vitest";
import {
  agreementPublicPath,
  formatAdvisorsMoney,
  mapAgreement,
  mapEngagementDetail,
  mapProposal,
  proposalPublicPath,
} from "@/lib/advisors/engagements";

describe("advisors engagements mappers", () => {
  it("maps proposal and agreement payloads", () => {
    const proposal = mapProposal({
      id: "11111111-1111-1111-1111-111111111111",
      engagementId: "22222222-2222-2222-2222-222222222222",
      versionNumber: 1,
      status: "sent",
      publicToken: "abc123abc123abc123abc123",
      title: "Essential Books",
      summary: "Monthly books",
      scopeText: "Core bookkeeping",
      exclusionsText: "Tax filing",
      serviceCode: "bookkeeping",
      planCode: "essential_books",
      currency: "USD",
      amountMinor: 19900,
      billingInterval: "month",
      pricingSnapshot: { plan: "essential_books" },
      validUntil: "2026-11-20T00:00:00Z",
      sentAt: "2026-11-06T00:00:00Z",
      respondedAt: null,
      responseNote: "",
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
      agreementToken: "agree123agree123agree123agree",
    });
    const agreement = mapAgreement({
      id: "33333333-3333-3333-3333-333333333333",
      engagementId: proposal.engagementId,
      proposalId: proposal.id,
      versionNumber: 1,
      status: "presented",
      publicToken: "agree123agree123agree123agree",
      title: "Service agreement",
      bodyText: "Terms",
      presentedAt: "2026-11-06T00:00:00Z",
      acceptedAt: null,
      acceptedName: null,
      acceptedEmail: null,
      consentAt: null,
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
      subscriptionStarted: false,
    });
    expect(proposal.amountMinor).toBe(19900);
    expect(proposal.agreementToken).toBeTruthy();
    expect(agreement.subscriptionStarted).toBe(false);
    expect(formatAdvisorsMoney(19900, "USD")).toContain("199");
    expect(proposalPublicPath(proposal.publicToken)).toBe(
      `/advisors/proposal/${proposal.publicToken}`,
    );
    expect(agreementPublicPath(agreement.publicToken)).toBe(
      `/advisors/agreement/${agreement.publicToken}`,
    );
  });

  it("maps engagement detail collections", () => {
    const detail = mapEngagementDetail({
      id: "22222222-2222-2222-2222-222222222222",
      clientId: "44444444-4444-4444-4444-444444444444",
      assignedAdvisorId: null,
      serviceCode: "coaching",
      planCode: "monthly_coaching",
      title: "Coaching engagement",
      status: "onboarding",
      currency: "USD",
      amountMinor: 29900,
      billingInterval: "month",
      scopeSummary: "Monthly coaching",
      notes: "",
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
      proposals: [],
      agreements: [],
      onboardingTasks: [
        {
          id: "55555555-5555-5555-5555-555555555555",
          engagementId: "22222222-2222-2222-2222-222222222222",
          code: "goals",
          title: "Capture coaching goals",
          description: "Priority outcomes",
          status: "pending",
          sortOrder: 10,
          requiresDocument: false,
          documentLabel: "",
          customerNote: "",
          adminNote: "",
          assignedAdvisorId: null,
          dueAt: null,
          completedAt: null,
          createdAt: "2026-11-06T00:00:00Z",
          updatedAt: "2026-11-06T00:00:00Z",
        },
      ],
    });
    expect(detail.onboardingTasks).toHaveLength(1);
    expect(detail.onboardingTasks[0]?.code).toBe("goals");
  });
});
