import { describe, expect, it } from "vitest";
import {
  formatLegacyImportSummary,
  mapLegacyExpenseMigrationPreview,
  mapLegacyExpenseMigrationResult,
} from "./legacy-migration";

describe("legacy expense migration helpers", () => {
  it("maps preview payloads", () => {
    const preview = mapLegacyExpenseMigrationPreview({
      pending_count: 2,
      already_imported_count: 1,
      sample: [
        {
          id: "leg1",
          claim_date: "2026-10-01",
          description: "Taxi",
          amount_minor: 2500,
          currency_code: "usd",
          status: "draft",
          claimant_user_id: "u1",
        },
      ],
    });
    expect(preview.pendingCount).toBe(2);
    expect(preview.sample[0]?.currencyCode).toBe("USD");
  });

  it("formats import summaries", () => {
    expect(
      formatLegacyImportSummary({ importedCount: 3, skippedCount: 1, limit: 50 }),
    ).toContain("Imported 3");
    expect(
      formatLegacyImportSummary({ importedCount: 0, skippedCount: 0, limit: 50 }),
    ).toMatch(/No legacy/i);
  });

  it("maps import results", () => {
    expect(
      mapLegacyExpenseMigrationResult({
        imported_count: 4,
        skipped_count: 0,
        limit: 50,
      }),
    ).toEqual({ importedCount: 4, skippedCount: 0, limit: 50 });
  });
});
