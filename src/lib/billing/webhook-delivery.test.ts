import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planWebhookDelivery } from "./webhook-delivery";

describe("webhook delivery recording", () => {
  it("plans an outcome without storing the request body", () => {
    expect(
      planWebhookDelivery({
        role: "platform_owner",
        provider: "stripe",
        eventId: "evt_1",
        status: "failed",
        reason: "Retry",
      }),
    ).toMatchObject({ stored: false, bodyStored: false, status: "failed" });
  });

  it("leaves the live webhook handler unchanged", () => {
    expect(() =>
      planWebhookDelivery({
        role: "platform_finance",
        provider: "stripe",
        eventId: "evt_1",
        status: "delivered",
        reason: "Retry",
      }),
    ).toThrow(/permission/);
    const handler = readFileSync(new URL("./webhooks.ts", import.meta.url), "utf8");
    expect(handler).not.toContain("platform_webhook_deliveries");
    const sql = readFileSync(
      new URL(
        "../../../supabase/migrations/20261102350000_webhook_delivery_record.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).not.toContain("payload");
    const before = readFileSync(
      new URL(
        "../../../supabase/migrations/20261102470000_webhook_delivery_before.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(before).toContain("jsonb_build_object('status', _previous)");
    expect(before).toContain("require_platform('integrations.manage')");
    expect(before).not.toContain("payload");
  });
});
