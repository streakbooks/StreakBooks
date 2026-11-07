import { describe, expect, it } from "vitest";
import { deriveIntegrationExceptions, isExceptionJob } from "@/lib/app-store/exceptions";

describe("deriveIntegrationExceptions", () => {
  it("returns empty when jobs succeed without failures", () => {
    expect(
      deriveIntegrationExceptions([
        {
          id: "1",
          appCode: "shopify",
          status: "succeeded",
          failed: 0,
          retryCount: 0,
          lastError: null,
          correlationId: "c1",
          createdAt: "2026-11-07",
        },
      ]),
    ).toEqual([]);
  });

  it("derives exceptions from failed jobs", () => {
    const rows = deriveIntegrationExceptions([
      {
        id: "2",
        appCode: "amazon_seller",
        status: "failed",
        failed: 3,
        retryCount: 1,
        lastError: "provider timeout",
        correlationId: "c2",
        createdAt: "2026-11-07",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.severity).toBe("error");
    expect(rows[0]?.summary).toContain("provider timeout");
  });

  it("treats failed count as exception even when status is running", () => {
    expect(
      isExceptionJob({
        id: "3",
        appCode: "stripe_payments",
        status: "running",
        failed: 2,
        retryCount: 0,
        lastError: null,
        correlationId: "c3",
        createdAt: "2026-11-07",
      }),
    ).toBe(true);
  });
});
