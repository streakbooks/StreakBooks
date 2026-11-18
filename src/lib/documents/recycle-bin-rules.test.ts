import { describe, expect, it } from "vitest";
import {
  canOfferPermanentPurge,
  DEFAULT_DOCUMENT_RETENTION_DAYS,
  MAX_DOCUMENT_RETENTION_DAYS,
  MIN_DOCUMENT_RETENTION_DAYS,
  validateRetentionDays,
} from "./recycle-bin-rules";

describe("Files Recycle Bin and retention rules", () => {
  it("defaults to 30 days and accepts only whole 7–3650 day retention", () => {
    expect(DEFAULT_DOCUMENT_RETENTION_DAYS).toBe(30);
    expect(MIN_DOCUMENT_RETENTION_DAYS).toBe(7);
    expect(MAX_DOCUMENT_RETENTION_DAYS).toBe(3650);
    expect(validateRetentionDays(7)).toBe(7);
    expect(validateRetentionDays("30")).toBe(30);
    expect(validateRetentionDays(3650)).toBe(3650);
    for (const value of [0, 6, 3651, 8.5, "7.5", "", " ", null, {}, "invalid", Infinity]) {
      expect(() => validateRetentionDays(value)).toThrow("7 and 3,650");
    }
  });

  it("never offers permanent purge on an active or protected attachment", () => {
    const now = Date.parse("2026-12-09T00:00:00Z");
    expect(
      canOfferPermanentPurge(
        {
          deleted_at: null,
          purge_after: null,
          retention_hold: false,
        },
        now,
      ),
    ).toBe(false);
    expect(
      canOfferPermanentPurge(
        {
          deleted_at: "2026-11-01T00:00:00Z",
          purge_after: "2026-12-01T00:00:00Z",
          retention_hold: true,
        },
        now,
      ),
    ).toBe(false);
  });

  it("does not offer a purge before the retained date", () => {
    const file = {
      deleted_at: "2026-11-01T00:00:00Z",
      purge_after: "2026-12-01T00:00:00Z",
      retention_hold: false,
    };
    expect(canOfferPermanentPurge(file, Date.parse("2026-11-30T23:59:59Z"))).toBe(false);
    expect(canOfferPermanentPurge(file, Date.parse("2026-12-01T00:00:00Z"))).toBe(true);
  });

  it("rejects malformed or reversed retention timestamps even if file is recycled", () => {
    for (const file of [
      { deleted_at: "bad", purge_after: "2026-12-01", retention_hold: false },
      { deleted_at: "2026-12-09", purge_after: "bad", retention_hold: false },
      { deleted_at: "2026-12-10", purge_after: "2026-12-01", retention_hold: false },
    ]) {
      expect(canOfferPermanentPurge(file, Date.parse("2027-01-01"))).toBe(false);
    }
    expect(
      canOfferPermanentPurge(
        {
          deleted_at: "2026-11-01",
          purge_after: "2026-12-01",
          retention_hold: false,
        },
        NaN,
      ),
    ).toBe(false);
  });

  it("keeps eligibility advisory, independent of document and company permissions", () => {
    const eligible = canOfferPermanentPurge(
      {
        deleted_at: "2026-11-01",
        purge_after: "2026-11-30",
        retention_hold: false,
      },
      Date.parse("2026-12-10"),
    );
    expect(eligible).toBe(true);
    // The browser's result never authorizes deletion; the DB RPC checks
    // membership, record manage permissions, hold and retention again.
  });
});
