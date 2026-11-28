import { describe, expect, it } from "vitest";
import { COMPLIANCE_PACKS } from "./compliance-packs";

describe("nonprofit compliance packs", () => {
  it("covers the target countries without claiming filing or government approval", () => {
    expect(COMPLIANCE_PACKS.map((pack) => pack.id)).toEqual([
      "US",
      "GB",
      "IN",
      "AU",
      "CA",
      "NZ",
      "INT",
    ]);
    for (const pack of COMPLIANCE_PACKS) {
      expect(pack.statutoryFiling).toBe(false);
      expect(pack.governmentApproved).toBe(false);
      expect(pack.items.length).toBeGreaterThan(0);
      for (const item of pack.items) {
        expect(item.sourceNote.toLowerCase()).toContain("does not file");
      }
    }
  });
});
