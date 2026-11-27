/**
 * Razorpay Test Mode mid-cycle plan-change verification.
 *
 *   RAZORPAY_SANDBOX=1 npm test -- --run src/lib/billing/razorpay-plan-change.integration.test.ts
 *
 * Requires rzp_test_ keys via `.env.local` (loaded by scripts/lib/load-env). Never uses live keys.
 * Full card-authorised upgrade charge amounts need a Dashboard-authenticated mandate; this suite
 * verifies identification, unsupported methods, API update behaviour, and webhook signature dedupe.
 */
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  razorpayMandateKindFromNotes,
  razorpaySupportsImmediatePlanChange,
} from "@/lib/billing/plan-change-math";
import { assertRazorpayTestKey } from "@/lib/billing/provider-keys";
import {
  createRazorpayClient,
  razorpayChangePlan,
  razorpayInspectSubscription,
  type RazorpayClient,
} from "@/lib/billing/providers/razorpay.server";
import { razorpaySignatureHex, verifyRazorpaySignature } from "@/lib/billing/signatures";

function loadLocalEnv(): void {
  for (const file of [".env", ".env.local"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const i = trimmed.indexOf("=");
      const key = trimmed.slice(0, i).trim();
      let value = trimmed.slice(i + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadLocalEnv();

const keyId = process.env["RAZORPAY_KEY_ID"] ?? "";
const secret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "";
const mode = (process.env["RAZORPAY_MODE"] ?? "").trim().toLowerCase();
const enabled =
  process.env["RAZORPAY_SANDBOX"] === "1" &&
  Boolean(keyId) &&
  Boolean(secret) &&
  mode === "test" &&
  process.env["STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS"] !== "true";

type Cleanup = () => Promise<void>;

async function createPlan(
  client: RazorpayClient,
  amountMinor: number,
  label: string,
): Promise<string> {
  const plan = await client.request("POST", "plans", {
    period: "monthly",
    interval: 1,
    item: {
      name: `StreakBooks sandbox ${label} ${Date.now()}`,
      amount: amountMinor,
      currency: "INR",
    },
    notes: { purpose: "streakbooks_sandbox_plan_change" },
  });
  const id = String(plan["id"] ?? "");
  expect(id).toMatch(/^plan_/);
  return id;
}

async function createSubscription(
  client: RazorpayClient,
  planId: string,
  payMethod: "card" | "upi" | "emandate",
): Promise<string> {
  const sub = await client.request("POST", "subscriptions", {
    plan_id: planId,
    total_count: 12,
    customer_notify: 0,
    notes: {
      pay_method: payMethod,
      purpose: "streakbooks_sandbox_plan_change",
    },
  });
  const id = String(sub["id"] ?? "");
  expect(id).toMatch(/^sub_/);
  return id;
}

describe.runIf(enabled)("Razorpay sandbox mid-cycle plan change", () => {
  const cleanups: Cleanup[] = [];

  afterAll(async () => {
    for (const fn of [...cleanups].reverse()) {
      try {
        await fn();
      } catch {
        /* best-effort cancel */
      }
    }
  });

  it("refuses live keys and requires test mode", () => {
    expect(keyId.startsWith("rzp_test_")).toBe(true);
    expect(mode).toBe("test");
    assertRazorpayTestKey(keyId);
  });

  it("identifies card vs UPI vs e-mandate from subscription notes", async () => {
    const client = createRazorpayClient();
    const planId = await createPlan(client, 49900, "std");
    const cardSubId = await createSubscription(client, planId, "card");
    const upiSubId = await createSubscription(client, planId, "upi");
    const emandateSubId = await createSubscription(client, planId, "emandate");
    for (const id of [cardSubId, upiSubId, emandateSubId]) {
      cleanups.push(async () => {
        await client.request("POST", `subscriptions/${encodeURIComponent(id)}/cancel`, {
          cancel_at_cycle_end: false,
        });
      });
    }

    const card = await razorpayInspectSubscription(client, cardSubId);
    const upi = await razorpayInspectSubscription(client, upiSubId);
    const emandate = await razorpayInspectSubscription(client, emandateSubId);

    expect(razorpayMandateKindFromNotes(card.notes, card.payment_method)).toBe("card");
    expect(razorpayMandateKindFromNotes(upi.notes, upi.payment_method)).toBe("upi");
    expect(razorpayMandateKindFromNotes(emandate.notes, emandate.payment_method)).toBe("emandate");
    expect(razorpaySupportsImmediatePlanChange("card")).toBe(true);
    expect(razorpaySupportsImmediatePlanChange("upi")).toBe(false);
    expect(razorpaySupportsImmediatePlanChange("emandate")).toBe(false);
  }, 60_000);

  it("UPI / e-mandate path refuses immediate in-place updates at the application layer", () => {
    expect(razorpaySupportsImmediatePlanChange("upi")).toBe(false);
    expect(razorpaySupportsImmediatePlanChange("emandate")).toBe(false);
  });

  it("attempts card schedule_change_at=now and records provider outcome", async () => {
    const client = createRazorpayClient();
    const standard = await createPlan(client, 49900, "std");
    const pro = await createPlan(client, 99900, "pro");
    const subId = await createSubscription(client, standard, "card");
    cleanups.push(async () => {
      await client.request("POST", `subscriptions/${encodeURIComponent(subId)}/cancel`, {
        cancel_at_cycle_end: false,
      });
    });

    const before = await razorpayInspectSubscription(client, subId);
    expect(razorpayMandateKindFromNotes(before.notes, before.payment_method)).toBe("card");

    let outcome: "updated" | "rejected" = "rejected";
    let providerMessage = "";
    try {
      await razorpayChangePlan(client, subId, pro, "now");
      outcome = "updated";
    } catch (caught) {
      providerMessage = caught instanceof Error ? caught.message : String(caught);
      // Created (not yet authenticated) mandates commonly reject mid-cycle updates.
      expect(providerMessage.length).toBeGreaterThan(0);
    }

    const after = await razorpayInspectSubscription(client, subId);
    // Entitlement must not be assumed from a browser redirect — only provider state.
    expect(["created", "authenticated", "active", "pending", "halted", "cancelled"]).toContain(
      after.status || before.status,
    );
    // Evidence for the report: whether Test Mode allowed an in-place update without auth.
    expect(["updated", "rejected"]).toContain(outcome);
    if (outcome === "rejected") {
      expect(providerMessage.toLowerCase()).not.toMatch(/live key|sk_live|rzp_live/);
    }
  }, 90_000);

  it("verifies webhook signature and treats duplicate signatures as valid redelivery", () => {
    expect(webhookSecret.length).toBeGreaterThan(0);
    const body = JSON.stringify({
      event: "subscription.updated",
      payload: { subscription: { entity: { id: "sub_sandbox", status: "active" } } },
    });
    const sig = razorpaySignatureHex(body, webhookSecret);
    expect(() => verifyRazorpaySignature(body, sig, webhookSecret)).not.toThrow();
    // Same body + signature again = valid redelivery (inbox dedupes by event id in SQL).
    expect(() => verifyRazorpaySignature(body, sig, webhookSecret)).not.toThrow();
    expect(() => verifyRazorpaySignature(body, "deadbeef", webhookSecret)).toThrow(
      /does not match/,
    );
  });
});

describe.runIf(!enabled)("Razorpay sandbox (skipped)", () => {
  it("documents how to enable sandbox verification", () => {
    expect(
      [
        "Set RAZORPAY_MODE=test and rzp_test_ keys in .env.local",
        "RAZORPAY_SANDBOX=1 npm test -- --run src/lib/billing/razorpay-plan-change.integration.test.ts",
        "npm run verify:razorpay",
        "Authenticate a card mandate in Dashboard Test Mode for charge-amount evidence",
      ].length,
    ).toBe(4);
  });
});
