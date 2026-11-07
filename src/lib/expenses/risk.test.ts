import { describe, expect, it } from "vitest";
import {
  evaluateLocalRiskHints,
  mapExpenseCategorySuggestion,
  mapExpenseClaimDuplicates,
  mapExpenseClaimRiskScan,
  riskScoreBand,
} from "./risk";

describe("expense risk helpers", () => {
  it("maps risk scan payloads", () => {
    const scan = mapExpenseClaimRiskScan({
      claim_id: "c1",
      score: 70,
      flags: [{ code: "missing_receipt", severity: "high", message: "Need receipt" }],
      ocr_available: false,
      ocr_note: "OCR off",
    });
    expect(scan.score).toBe(70);
    expect(scan.flags[0]?.code).toBe("missing_receipt");
    expect(riskScoreBand(scan.score)).toBe("elevated");
  });

  it("maps duplicate matches", () => {
    const dups = mapExpenseClaimDuplicates({
      duplicates: [
        {
          claim_id: "c2",
          claim_number: "EXP-2",
          approval_status: "submitted",
          total_minor: 1000,
          claim_currency: "aud",
          claim_date: "2026-11-01",
          score: 90,
        },
      ],
    });
    expect(dups[0]?.claimCurrency).toBe("AUD");
    expect(dups[0]?.score).toBe(90);
  });

  it("maps category suggestions", () => {
    expect(mapExpenseCategorySuggestion({ suggested: false })).toEqual({ suggested: false });
    expect(
      mapExpenseCategorySuggestion({
        suggested: true,
        merchant_name: "Uber",
        category_id: "cat1",
        category_name: "Travel",
        prior_uses: 4,
      }),
    ).toMatchObject({ suggested: true, categoryName: "Travel", priorUses: 4 });
  });

  it("evaluates local weekend and receipt hints", () => {
    const flags = evaluateLocalRiskHints({
      totalMinor: 5000,
      requireReceiptAboveMinor: 1000,
      hasAttachment: false,
      lineDates: ["2026-11-07"], // Saturday
      lineGrossMinors: [10000],
    });
    expect(flags.some((f) => f.code === "missing_receipt")).toBe(true);
    expect(flags.some((f) => f.code === "weekend_expense")).toBe(true);
    expect(flags.some((f) => f.code === "round_amount")).toBe(true);
  });
});
