import { describe, expect, it } from "vitest";
import {
  formatEscalationRefreshSummary,
  mapExpenseApprovalEscalationList,
  mapExpenseApprovalEscalationRefresh,
} from "./escalation";

describe("expense approval escalation helpers", () => {
  it("maps escalation list payloads", () => {
    const list = mapExpenseApprovalEscalationList({
      escalation_days: 5,
      claims: [
        {
          id: "c1",
          claim_number: "EXP-1",
          title: "Stale",
          claim_date: "2026-10-01",
          claim_currency: "USD",
          approval_status: "submitted",
          posting_status: "not_posted",
          reimbursement_status: "not_eligible",
          payment_source: "employee_paid",
          total_minor: 100,
          reimbursable_minor: 100,
          version: 1,
        },
      ],
    });
    expect(list.escalationDays).toBe(5);
    expect(list.claims[0]?.claimNumber).toBe("EXP-1");
  });

  it("formats refresh summaries", () => {
    expect(
      formatEscalationRefreshSummary({ escalationDays: 5, notifiedCount: 3 }),
    ).toContain("3 notification");
    expect(
      formatEscalationRefreshSummary({ escalationDays: 0, notifiedCount: 0 }),
    ).toMatch(/disabled/i);
  });

  it("maps refresh payloads", () => {
    expect(
      mapExpenseApprovalEscalationRefresh({
        escalation_days: 7,
        notified_count: 2,
      }),
    ).toEqual({ escalationDays: 7, notifiedCount: 2 });
  });
});
