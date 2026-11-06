import { describe, expect, it } from "vitest";
import { mapAdvisorsSubscription, mapBillingBoard } from "@/lib/advisors/billing";

describe("advisors billing mappers", () => {
  it("maps billing board payload", () => {
    const board = mapBillingBoard({
      skuMap: [
        {
          advisorsPlanCode: "essential_books",
          serviceCode: "bookkeeping",
          billingPlanCode: "advisors_essential_books",
          defaultInterval: "month",
          isRecurring: true,
          notes: "",
          planName: "Advisors Essential Books",
          monthlyUsd: 19900,
        },
      ],
      subscriptions: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          engagementId: "22222222-2222-2222-2222-222222222222",
          clientId: "33333333-3333-3333-3333-333333333333",
          companyId: "44444444-4444-4444-4444-444444444444",
          advisorsPlanCode: "essential_books",
          billingPlanCode: "advisors_essential_books",
          billingInterval: "month",
          currency: "USD",
          amountMinor: 19900,
          status: "pending_checkout",
          checkoutId: null,
          startedAt: null,
          cancelledAt: null,
          adminNotes: "",
          createdAt: "2026-11-06T00:00:00Z",
          updatedAt: "2026-11-06T00:00:00Z",
        },
      ],
      eligibleEngagements: [],
    });
    expect(board.skuMap).toHaveLength(1);
    expect(board.subscriptions[0]?.billingPlanCode).toBe("advisors_essential_books");
    expect(mapAdvisorsSubscription(board.subscriptions[0]).status).toBe("pending_checkout");
  });
});
