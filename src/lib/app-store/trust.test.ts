import { describe, expect, it } from "vitest";
import { DEFAULT_MARKETPLACE_APPS } from "@/lib/app-store/catalogue";
import {
  certificationLabel,
  hasCompatibilityWarning,
  isCertified,
  parseTrustFields,
} from "@/lib/app-store/trust";

describe("marketplace trust", () => {
  it("does not mark seed apps as certified by default", () => {
    for (const app of DEFAULT_MARKETPLACE_APPS) {
      expect(isCertified(app.certificationStatus)).toBe(false);
      expect(app.suspended).toBe(false);
    }
  });

  it("marks native LinkBooks publishers as verified without claiming certification", () => {
    const shopify = DEFAULT_MARKETPLACE_APPS.find((a) => a.code === "shopify");
    expect(shopify?.publisherVerified).toBe(true);
    expect(certificationLabel(shopify!.certificationStatus)).toBe("Not certified");
  });

  it("parses trust fields from catalogue payloads", () => {
    const trust = parseTrustFields({
      publisherVerified: true,
      certificationStatus: "certified",
      apiVersion: "v2",
      deprecationAt: "2027-01-01",
    });
    expect(trust.publisherVerified).toBe(true);
    expect(isCertified(trust.certificationStatus)).toBe(true);
    expect(hasCompatibilityWarning(trust)).toBe(true);
  });
});
