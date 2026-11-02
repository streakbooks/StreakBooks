import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { webhookDeliveryHistory } from "./webhook-history";

describe("webhook delivery history", () => {
  it("keeps a missing store unrecorded", () => {
    expect(webhookDeliveryHistory({ role: "platform_owner", rows: null })).toEqual({
      status: "unrecorded",
      failed: null,
      rows: [],
    });
  });

  it("counts failed deliveries from recorded rows", () => {
    const history = webhookDeliveryHistory({
      role: "platform_owner",
      rows: [
        {
          id: "d1",
          provider: "stripe",
          eventId: "evt_1",
          status: "failed",
          at: "2026-11-02T08:00:00.000Z",
        },
      ],
    });
    expect(history.failed).toBe(1);
    expect(history.status).toBe("recorded");
  });

  it("lists outcomes only and is not applied", () => {
    const sql = readFileSync(
      new URL(
        "../../../supabase/migrations/20261102210000_webhook_deliveries.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).not.toContain("payload");
    expect(sql).toContain("private.require_platform('integrations.view')");
    expect(() => webhookDeliveryHistory({ role: "platform_finance", rows: null })).toThrow(
      /permission/,
    );
  });
});
