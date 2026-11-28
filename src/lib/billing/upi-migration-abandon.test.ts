import { beforeEach, describe, expect, it, vi } from "vitest";

type RpcCall = { fn: string; args: Record<string, unknown> | undefined };
const rpcCalls: RpcCall[] = [];
let rpcHandler: (fn: string, args?: Record<string, unknown>) => unknown = () => null;

const inspectMock = vi.fn();
const cancelMock = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      try {
        return { data: await rpcHandler(fn, args), error: null };
      } catch (error) {
        const failure = error as { message: string };
        return { data: null, error: { message: failure.message } };
      }
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { message: "unused" } }),
        }),
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { provider_subscription_id: "sub_old" },
            error: null,
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/billing/providers/razorpay.server", () => ({
  createRazorpayClient: () => ({}),
  razorpayInspectSubscription: (...args: unknown[]) => inspectMock(...args),
  razorpayCancelImmediate: (...args: unknown[]) => cancelMock(...args),
}));

const {
  failAbandonedUpiMigration,
  migrationTreatsOldSubscriptionAsRetired,
  parseMigrationRow,
  recoverDueUpiMigrations,
} = await import("@/lib/billing/upi-migration.server");

function migrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    companyId: "22222222-2222-2222-2222-222222222222",
    status: "awaiting_customer_authorization",
    provider: "razorpay",
    mandateKind: "upi",
    oldProviderSubscriptionId: "sub_old",
    newProviderSubscriptionId: "sub_new",
    checkoutId: "33333333-3333-3333-3333-333333333333",
    fromPlanCode: "standard",
    toPlanCode: "pro",
    fromInterval: "month",
    toInterval: "month",
    currency: "INR",
    fromAmountMinor: 49900,
    toAmountMinor: 99900,
    proratedEstimateMinor: 48696,
    upfrontAddonMinor: 48696,
    upfrontEnabled: true,
    failureReason: null,
    cancelAttempts: 0,
    nextRetryAt: null,
    confirmedAt: null,
    completedAt: null,
    createdAt: "2026-11-28T08:00:00.000Z",
    updatedAt: "2026-11-28T08:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  rpcCalls.length = 0;
  rpcHandler = () => null;
  inspectMock.mockReset();
  cancelMock.mockReset();
  vi.stubEnv("RAZORPAY_UPI_MIGRATION_ENABLED", "1");
  vi.stubEnv("RAZORPAY_UPI_MIGRATION_ABANDON_HOURS", "2");
});

describe("failAbandonedUpiMigration", () => {
  it("cancels unused new Razorpay subscription and marks failed (abandon checkout)", async () => {
    const open = migrationRow();
    const failed = migrationRow({
      status: "failed",
      failureReason: "Customer cancelled mandate authorisation from Settings.",
    });
    rpcHandler = (fn) => {
      if (fn === "billing_migration_get") return open;
      if (fn === "billing_migration_transition") return failed;
      return null;
    };
    inspectMock.mockResolvedValue({ status: "created" });
    cancelMock.mockResolvedValue({ status: "cancelled" });

    const result = await failAbandonedUpiMigration(
      open.id,
      "Customer cancelled mandate authorisation from Settings.",
    );

    expect(result.status).toBe("failed");
    expect(inspectMock).toHaveBeenCalled();
    expect(cancelMock).toHaveBeenCalledWith(expect.anything(), "sub_new");
    expect(rpcCalls.some((c) => c.fn === "billing_migration_transition")).toBe(true);
  });

  it("refuses abandon after new mandate is authoritatively confirmed", async () => {
    rpcHandler = () => migrationRow({ status: "awaiting_customer_authorization" });
    inspectMock.mockResolvedValue({ status: "active" });

    await expect(
      failAbandonedUpiMigration("11111111-1111-1111-1111-111111111111", "abandon"),
    ).rejects.toThrow(/already confirmed/i);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("refuses abandon once post-confirm (old cancel still required)", async () => {
    rpcHandler = () => migrationRow({ status: "new_subscription_confirmed" });

    await expect(
      failAbandonedUpiMigration("11111111-1111-1111-1111-111111111111", "abandon"),
    ).rejects.toThrow(/cannot be abandoned/i);
    expect(inspectMock).not.toHaveBeenCalled();
  });

  it("is idempotent when migration is already failed", async () => {
    const failed = migrationRow({ status: "failed" });
    rpcHandler = () => failed;
    const result = await failAbandonedUpiMigration(failed.id, "retry abandon");
    expect(result.status).toBe("failed");
    expect(cancelMock).not.toHaveBeenCalled();
  });
});

describe("recoverDueUpiMigrations stale pre-confirm", () => {
  it("fails timed-out awaiting authorisation after re-checking Razorpay is not confirmed", async () => {
    const stale = migrationRow({
      createdAt: "2026-11-27T08:00:00.000Z",
      updatedAt: "2026-11-27T08:00:00.000Z",
    });
    const failed = migrationRow({ status: "failed", failureReason: "timed out" });
    rpcHandler = (fn, args) => {
      if (fn === "billing_migration_due") return [stale.id];
      if (fn === "billing_migration_get") return stale;
      if (fn === "billing_migration_transition") {
        expect(args?.["_to_status"]).toBe("failed");
        return failed;
      }
      return null;
    };
    inspectMock.mockResolvedValue({ status: "created" });
    cancelMock.mockResolvedValue({ status: "cancelled" });

    const summary = await recoverDueUpiMigrations(5);
    expect(summary.failed).toBe(1);
    expect(cancelMock).toHaveBeenCalled();
  });

  it("advances instead of expiring when Razorpay already confirmed the new mandate", async () => {
    const awaiting = migrationRow({
      createdAt: "2026-11-27T08:00:00.000Z",
      status: "awaiting_customer_authorization",
    });
    const confirmed = migrationRow({ status: "new_subscription_confirmed" });
    const completed = migrationRow({ status: "completed" });
    const transitionTargets: string[] = [];
    rpcHandler = (fn, args) => {
      if (fn === "billing_migration_due") return [awaiting.id];
      if (fn === "billing_migration_get") {
        const last = transitionTargets.at(-1);
        if (last === "completed") return completed;
        if (
          last === "new_subscription_confirmed" ||
          last === "old_subscription_cancellation_pending"
        )
          return confirmed;
        return awaiting;
      }
      if (fn === "billing_migration_by_checkout") return awaiting;
      if (fn === "billing_migration_by_new_subscription") return awaiting;
      if (fn === "billing_migration_transition") {
        transitionTargets.push(String(args?.["_to_status"] ?? ""));
        if (args?.["_to_status"] === "failed") {
          throw new Error("must not fail a provider-confirmed migration on timeout");
        }
        if (args?.["_to_status"] === "new_subscription_confirmed") return confirmed;
        if (args?.["_to_status"] === "old_subscription_cancellation_pending") return confirmed;
        if (args?.["_to_status"] === "completed") return completed;
        return confirmed;
      }
      return null;
    };
    inspectMock.mockResolvedValue({ status: "active" });
    cancelMock.mockResolvedValue({ status: "cancelled" });

    const summary = await recoverDueUpiMigrations(5);
    expect(transitionTargets).toContain("new_subscription_confirmed");
    expect(transitionTargets).not.toContain("failed");
    expect(summary.failed).toBe(0);
  });

  it("soft-noops recent awaiting migrations without failing them", async () => {
    const fresh = migrationRow({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    rpcHandler = (fn) => {
      if (fn === "billing_migration_due") return [fresh.id];
      if (fn === "billing_migration_get") return fresh;
      return null;
    };
    inspectMock.mockResolvedValue({ status: "created" });

    const summary = await recoverDueUpiMigrations(5);
    expect(summary.failed).toBe(0);
    expect(summary.processed).toBe(1);
    expect(cancelMock).not.toHaveBeenCalled();
  });
});

describe("retry after incomplete initiation", () => {
  it("passes releaseIdempotencyKey when abandoning so the UNIQUE key can be reused", async () => {
    const open = migrationRow({
      status: "awaiting_customer_authorization",
      newProviderSubscriptionId: "sub_new",
      checkoutId: null,
    });
    const failed = migrationRow({ status: "failed" });
    rpcHandler = (fn, args) => {
      if (fn === "billing_migration_get") return open;
      if (fn === "billing_migration_transition") {
        expect(args?.["_patch"]).toMatchObject({ releaseIdempotencyKey: "true" });
        return failed;
      }
      return null;
    };
    inspectMock.mockResolvedValue({ status: "created" });
    cancelMock.mockResolvedValue({ status: "cancelled" });
    await failAbandonedUpiMigration(open.id, "cannot resume");
  });

  it("releases initiated rows that never got a Razorpay subscription or checkout", async () => {
    const emptyInitiated = migrationRow({
      status: "initiated",
      newProviderSubscriptionId: null,
      checkoutId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const failed = migrationRow({
      ...emptyInitiated,
      status: "failed",
      failureReason: "Previous plan migration never reached Razorpay checkout. Safe to retry.",
    });
    rpcHandler = (fn) => {
      if (fn === "billing_migration_get") return emptyInitiated;
      if (fn === "billing_migration_transition") return failed;
      return null;
    };

    const result = await failAbandonedUpiMigration(
      emptyInitiated.id,
      "Previous plan migration never reached Razorpay checkout. Safe to retry.",
    );
    expect(result.status).toBe("failed");
    expect(inspectMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });
});

describe("old subscription stays authoritative until confirm", () => {
  it("does not treat old mandate as retired while awaiting authorisation", () => {
    expect(
      migrationTreatsOldSubscriptionAsRetired(
        {
          oldProviderSubscriptionId: "sub_old",
          newProviderSubscriptionId: "sub_new",
          confirmedAt: null,
          status: "awaiting_customer_authorization",
        },
        "sub_old",
      ),
    ).toBe(false);
  });
});

describe("proration estimate for Standard → Pro monthly", () => {
  it("matches remaining-period style prorated upgrade amount", async () => {
    const { buildUpiMigrationPreviewAmounts } = await import("@/lib/billing/upi-migration.server");
    const amounts = buildUpiMigrationPreviewAmounts({
      currentAmountMinor: 49900,
      targetAmountMinor: 99900,
      periodStartIso: "2026-11-27T00:00:00.000Z",
      periodEndIso: "2026-12-27T00:00:00.000Z",
      currency: "INR",
    });
    expect(amounts.proratedEstimateMinor).toBeGreaterThan(40_000);
    expect(amounts.proratedEstimateMinor).toBeLessThan(50_000);
    expect(amounts.remainingDays).toBe(29);
  });
});

describe("parseMigrationRow", () => {
  it("round-trips open migration shape used by the in-progress banner", () => {
    const row = parseMigrationRow(migrationRow());
    expect(row?.status).toBe("awaiting_customer_authorization");
    expect(row?.toPlanCode).toBe("pro");
    expect(row?.proratedEstimateMinor).toBe(48696);
  });
});
