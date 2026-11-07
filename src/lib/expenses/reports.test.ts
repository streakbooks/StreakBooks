import { describe, expect, it } from "vitest";
import {
  buildExpenseClaimsExportCsv,
  defaultExpenseReportRange,
  mapExpenseClaimAuditEvents,
  mapExpenseClaimExportRows,
  mapExpenseManagementReport,
} from "./reports";

describe("expense reports", () => {
  it("maps report summary payloads", () => {
    const report = mapExpenseManagementReport({
      company_id: "co1",
      from_date: "2026-08-01",
      to_date: "2026-11-01",
      totals: { claim_count: 2, total_minor: 5000, reimbursable_minor: 4000 },
      by_approval_status: [{ status: "approved", claim_count: 1, total_minor: 3000 }],
      by_posting_status: [],
      by_reimbursement_status: [],
      open_aging: { "0_7": 1, "8_30": 0, "31_90": 1, "90_plus": 0 },
    });
    expect(report.totals.claimCount).toBe(2);
    expect(report.openAging.days0to7).toBe(1);
    expect(report.byApprovalStatus[0]?.status).toBe("approved");
  });

  it("builds a CSV with formula-safe cells", () => {
    const csv = buildExpenseClaimsExportCsv({
      fromDate: "2026-01-01",
      toDate: "2026-11-01",
      rows: [
        {
          id: "1",
          claimNumber: "EXP-1",
          title: "=HACK",
          claimDate: "2026-10-01",
          claimCurrency: "USD",
          approvalStatus: "approved",
          postingStatus: "posted",
          reimbursementStatus: "paid",
          paymentSource: "employee_paid",
          totalMinor: 1250,
          reimbursableMinor: 1250,
        },
      ],
    });
    expect(csv).toContain("claim_number");
    expect(csv).toContain("'=HACK");
    expect(csv).toContain("12.50");
  });

  it("maps export and audit rows", () => {
    expect(
      mapExpenseClaimExportRows({
        claims: [
          {
            id: "c1",
            claim_number: "EXP-9",
            title: "Trip",
            claim_date: "2026-10-02",
            claim_currency: "aud",
            approval_status: "draft",
            posting_status: "not_posted",
            reimbursement_status: "not_eligible",
            payment_source: "employee_paid",
            total_minor: 100,
            reimbursable_minor: 100,
          },
        ],
      })[0]?.claimCurrency,
    ).toBe("AUD");
    expect(
      mapExpenseClaimAuditEvents({
        events: [
          {
            id: "e1",
            claim_id: "c1",
            event_type: "submitted",
            note: null,
            acted_at: "2026-11-01T00:00:00Z",
            approval_status_after: "submitted",
          },
        ],
      })[0]?.eventType,
    ).toBe("submitted");
  });

  it("defaults to a 90-day window", () => {
    expect(defaultExpenseReportRange("2026-11-07")).toEqual({
      fromDate: "2026-08-09",
      toDate: "2026-11-07",
    });
  });
});
