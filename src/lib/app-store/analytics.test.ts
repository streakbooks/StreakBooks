import { describe, expect, it } from "vitest";
import { buildMarketplaceAnalyticsPayload } from "@/lib/app-store/analytics";

describe("marketplace analytics helpers", () => {
  it("builds bounded search payloads", () => {
    expect(
      buildMarketplaceAnalyticsPayload({
        event: "search",
        query: "x".repeat(200),
        category: "ecommerce",
      }),
    ).toEqual({
      event: "search",
      query: "x".repeat(120),
      category: "ecommerce",
    });
  });
});
