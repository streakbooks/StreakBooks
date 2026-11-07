import { describe, expect, it } from "vitest";
import { billCardDisplayStatus } from "./transaction-card-status";

describe("Bill mobile cards — status display from authorised rows", () => {
  it("marks posted unpaid and partly paid overdue balances as overdue", () => {
    for (const status of ["authorised", "partly_paid", "partially_paid", "awaiting_payment"]) {
      expect(billCardDisplayStatus({
        status, days_overdue: 3, balance_due_minor: 1200,
      })).toBe("overdue");
    }
  });

  it("never shows fully paid, cancelled, void or unposted documents as overdue", () => {
    for (const status of ["paid", "draft", "awaiting_approval", "void", "cancelled"]) {
      expect(billCardDisplayStatus({
        status, days_overdue: 5, balance_due_minor: 1000,
      })).toBe(status);
    }
  });

  it("does not show paid-off or future-due balances as overdue", () => {
    expect(billCardDisplayStatus({
      status: "authorised", days_overdue: 7, balance_due_minor: 0,
    })).toBe("authorised");
    expect(billCardDisplayStatus({
      status: "partly_paid", days_overdue: 0, balance_due_minor: 500,
    })).toBe("partly_paid");
    expect(billCardDisplayStatus({
      status: "partly_paid", days_overdue: -1, balance_due_minor: 500,
    })).toBe("partly_paid");
  });

  it("rejects malformed overdue and outstanding numbers as reasons to change the display", () => {
    expect(billCardDisplayStatus({
      status: "authorised", days_overdue: Number.NaN, balance_due_minor: 200,
    })).toBe("authorised");
    expect(billCardDisplayStatus({
      status: "authorised", days_overdue: 3, balance_due_minor: Number.POSITIVE_INFINITY,
    })).toBe("authorised");
  });
});
