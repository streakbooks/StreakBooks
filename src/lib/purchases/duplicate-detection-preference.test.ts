import { describe, expect, it } from "vitest";
import {
  purchaseDuplicateDetectionEnabled,
  shouldShowDuplicateSupplierBillWarning,
} from "./duplicate-detection-preference";

describe("purchase duplicate detection preference", () => {
  it("defaults to checking duplicates and fails closed for malformed saved settings", () => {
    expect(purchaseDuplicateDetectionEnabled(null)).toBe(true);
    expect(purchaseDuplicateDetectionEnabled({ duplicate_detection: false })).toBe(false);
    expect(purchaseDuplicateDetectionEnabled({ duplicate_detection: "off" })).toBe(true);
  });

  it("shows the supplier-invoice warning only when the organisation enables the preflight", () => {
    expect(shouldShowDuplicateSupplierBillWarning(true, true)).toBe(true);
    expect(shouldShowDuplicateSupplierBillWarning(true, false)).toBe(false);
    expect(shouldShowDuplicateSupplierBillWarning(false, true)).toBe(false);
  });
});
