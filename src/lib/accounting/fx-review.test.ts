import { describe, expect, it } from "vitest";
import type { AutoReversalRow, RevaluationPreview } from "./fx.functions";
import { filterAutoReversals, fxRevaluationCsv, fxReviewSignature } from "./fx-review";

const reverse = (status: AutoReversalRow["status"], reverse_on: string): AutoReversalRow => ({
  id: `${status}-${reverse_on}`,
  journal_id: "j",
  reverse_on,
  origin: "manual",
  status,
  reversal_journal_id: null,
  attempts: 0,
  last_error: null,
  journal_number: 1,
  journal_date: "2026-10-31",
  memo: null,
});

describe("FX review safety", () => {
  it("creates stable date/rate signatures and invalidates edits", () => {
    const one = fxReviewSignature("company", "2026-10-31", { USD: " 1.20 ", EUR: "0.80" });
    expect(one).toBe(fxReviewSignature("company", "2026-10-31", { EUR: "0.80", USD: "1.20" }));
    expect(one).not.toBe(fxReviewSignature("company", "2026-11-01", { EUR: "0.80", USD: "1.20" }));
    expect(one).not.toBe(fxReviewSignature("company", "2026-10-31", { EUR: "0.81", USD: "1.20" }));
    expect(one).not.toBe(fxReviewSignature("another", "2026-10-31", { EUR: "0.80", USD: "1.20" }));
  });

  it("filters due auto reversals without treating future/past done rows as outstanding", () => {
    const rows = [
      reverse("pending", "2026-11-01"),
      reverse("pending", "2026-11-05"),
      reverse("failed", "2026-11-04"),
      reverse("done", "2026-11-02"),
      reverse("cancelled", "2026-11-02"),
    ];
    expect(filterAutoReversals(rows, "due", "2026-11-04").map((r) => r.status)).toEqual([
      "pending",
      "failed",
    ]);
    expect(filterAutoReversals(rows, "failed", "2026-11-04")).toHaveLength(1);
    expect(filterAutoReversals(rows, "all", "2026-11-04")).toHaveLength(5);
  });

  it("exports exact preview data in minor units without spreadsheet injection", () => {
    const preview: RevaluationPreview = {
      base_currency: "GBP",
      as_of_date: "2026-11-01",
      missing: [],
      lines: [
        {
          account_id: "acc",
          account_code: "100",
          account_name: "=EVIL()",
          currency_code: "EUR",
          txn_net_minor: 10000,
          booked_base_minor: 9000,
          rate: 0.95,
          rate_source: "manual",
          rate_date: null,
          closing_base_minor: 9500,
          adjustment_minor: 500,
          stale: false,
        },
      ],
    };
    const csv = fxRevaluationCsv(preview);
    expect(csv).toContain("'=EVIL()");
    expect(csv).toContain("10000,9000,0.95,9500,500");
    expect(csv).toContain("2026-11-01");
  });
});
