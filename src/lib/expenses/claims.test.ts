import { describe, expect, it } from "vitest";
import { mapExpenseClaimDetail, mapExpenseClaimSummary, toExpenseClaimPayload } from "./claims";

describe("expense claim mapping", () => {
  it("maps list rows and detail payloads", () => {
    expect(
      mapExpenseClaimSummary({
        id: "1",
        claim_number: "EXP-0001",
        title: "Taxi",
        claim_date: "2026-11-07",
        claim_currency: "USD",
        approval_status: "draft",
        posting_status: "not_posted",
        reimbursement_status: "not_eligible",
        total_minor: 1100,
        reimbursable_minor: 1100,
        version: 1,
        updated_at: "2026-11-07T00:00:00Z",
      }),
    ).toMatchObject({
      claimNumber: "EXP-0001",
      approvalStatus: "draft",
      totalMinor: 1100,
    });

    const detail = mapExpenseClaimDetail({
      id: "1",
      claim_number: "EXP-0001",
      title: "Taxi",
      claim_date: "2026-11-07",
      claim_currency: "USD",
      reimbursement_currency: "USD",
      payment_source: "employee_paid",
      approval_status: "draft",
      posting_status: "not_posted",
      reimbursement_status: "not_eligible",
      subtotal_minor: 1000,
      tax_minor: 100,
      total_minor: 1100,
      reimbursable_minor: 1100,
      version: 1,
      updated_at: "2026-11-07T00:00:00Z",
      lines: [
        {
          id: "l1",
          line_no: 1,
          expense_date: "2026-11-07",
          description: "Airport taxi",
          account_id: "acc",
          net_minor: 1000,
          tax_minor: 100,
          gross_minor: 1100,
          currency_code: "USD",
        },
      ],
    });
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]?.description).toBe("Airport taxi");
  });

  it("serialises drafts for save_expense_claim", () => {
    expect(
      toExpenseClaimPayload({
        title: "Taxi",
        claimDate: "2026-11-07",
        claimCurrency: "USD",
        lines: [
          {
            expenseDate: "2026-11-07",
            description: "Airport taxi",
            accountId: "acc",
            netMinor: 1000,
            taxMinor: 100,
            grossMinor: 1100,
          },
        ],
      }),
    ).toMatchObject({
      title: "Taxi",
      claim_currency: "USD",
      lines: [{ account_id: "acc", gross_minor: 1100 }],
    });
  });
});
