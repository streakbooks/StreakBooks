import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listSchema, mutationSchema, overviewSchema } from "./catalog";
import type { ListResult, Overview, PlatformContext, Row } from "./catalog";

// User-scoped client only: the database enforces role, MFA and live session checks.
function unwrap<T>(result: { data: unknown; error: { message: string } | null }): T {
  setResponseHeader("Cache-Control", "private, no-store");
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
export const getPlatformContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap<PlatformContext>(await context.supabase.rpc("platform_context" as never)),
  );
export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => overviewSchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<Overview>(
      await context.supabase.rpc(
        "platform_overview" as never,
        { _from: data.from, _to: data.to } as never,
      ),
    ),
  );
export const listPlatformRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => listSchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<ListResult>(
      await context.supabase.rpc(
        "platform_list" as never,
        {
          _resource: data.resource,
          _search: data.search,
          _page: data.page,
          _sort: data.sort,
        } as never,
      ),
    ),
  );
export const mutatePlatform = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => mutationSchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; id: string }>(
      await context.supabase.rpc(
        "platform_mutate" as never,
        {
          _action: data.action,
          _id: data.id,
          _payload: data.payload,
          _reason: data.reason,
        } as never,
      ),
    ),
  );
export const getPlatformHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap<Row>(await context.supabase.rpc("platform_health" as never)),
  );
export const readSupportDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ companyId: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) =>
    unwrap<Row[]>(
      await context.supabase.rpc(
        "platform_support_read" as never,
        { _company_id: data.companyId } as never,
      ),
    ),
  );
export const getAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ companyId: z.string().uuid().nullable() }).parse(v))
  .handler(async ({ context, data }) =>
    unwrap<{ id: string; name: string; message: string }[]>(
      await context.supabase.rpc(
        "platform_announcements" as never,
        { _company_id: data.companyId } as never,
      ),
    ),
  );
export const getIntegrationReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = unwrap<PlatformContext>(await context.supabase.rpc("platform_context" as never));
    if (!access.permissions.includes("integrations.view"))
      throw new Error("Integration permission required");
    return [
      {
        provider: "Stripe",
        configured: Boolean(process.env["STRIPE_SECRET_KEY"]),
        status: "Connection not verified",
      },
      {
        provider: "Razorpay",
        configured: Boolean(process.env["RAZORPAY_KEY_ID"] && process.env["RAZORPAY_KEY_SECRET"]),
        status: "Connection not verified",
      },
      {
        provider: "Resend email",
        configured: Boolean(process.env["RESEND_API_KEY"] && process.env["EMAIL_FROM"]),
        status: "Connection not verified",
      },
    ];
  });
export const getPlatformDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({ resource: z.enum(["businesses", "users", "firms"]), id: z.string().uuid() })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<Row>(
      await context.supabase.rpc(
        "platform_details" as never,
        { _resource: data.resource, _id: data.id } as never,
      ),
    ),
  );
export const bulkBusinessStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(100),
        status: z.enum(["active", "inactive", "suspended", "archived"]),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; count: number }>(
      await context.supabase.rpc(
        "platform_bulk_business" as never,
        { _ids: data.ids, _status: data.status, _reason: data.reason } as never,
      ),
    ),
  );
export const exportPlatformRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => listSchema.parse(v))
  .handler(async ({ context, data }) => {
    const result = unwrap<ListResult>(
      await context.supabase.rpc(
        "platform_export" as never,
        { _resource: data.resource, _search: data.search, _page: data.page } as never,
      ),
    );
    if (data.sort === "desc") return result;
    return unwrap<ListResult>(
      await context.supabase.rpc(
        "platform_list" as never,
        {
          _resource: data.resource,
          _search: data.search,
          _page: data.page,
          _sort: data.sort,
        } as never,
      ),
    );
  });

const entitlementChange = z.object({
  feature: z.string().trim().min(2).max(64),
  scope: z.enum(["user", "business", "firm", "plan", "global"]),
  scopeId: z.string().uuid().nullable().default(null),
  planCode: z.string().trim().max(64).nullable().default(null),
  source: z.enum(["kill_switch", "suspension", "revoke", "grant", "addon", "trial"]),
  effect: z.enum(["allow", "deny"]),
  startsAt: z.string().datetime().nullable().default(null),
  expiresAt: z.string().datetime().nullable().default(null),
  reason: z.string().trim().min(3).max(1000),
  notes: z.string().trim().max(2000).default(""),
});

export const setPlatformEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => entitlementChange.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; pending: boolean; id: string }>(
      await context.supabase.rpc(
        "platform_set_entitlement" as never,
        {
          _feature: data.feature,
          _scope: data.scope,
          _scope_id: data.scopeId,
          _plan_code: data.planCode,
          _source: data.source,
          _effect: data.effect,
          _starts: data.startsAt,
          _expires: data.expiresAt,
          _reason: data.reason,
          _notes: data.notes,
        } as never,
      ),
    ),
  );

export const listPlatformApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap<{ rows: Row[] }>(await context.supabase.rpc("platform_list_approvals" as never)),
  );

export const decidePlatformApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true }>(
      await context.supabase.rpc(
        "platform_decide_approval" as never,
        { _id: data.id, _decision: data.decision, _reason: data.reason } as never,
      ),
    ),
  );

const reconciliationRow = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  overviewMinor: z.number().int().nonnegative(),
  storedMinor: z.number().int().nonnegative(),
  differenceMinor: z.number().int(),
});

const reconciliationPayload = z.object({
  state: z.enum(["forbidden", "empty", "match", "mismatch", "uncovered"]),
  rows: z.array(reconciliationRow),
  missingFromStore: z.number().int().nonnegative(),
  extraInStore: z.number().int().nonnegative(),
  drift: z.number().int().nonnegative(),
});

export const getPlatformMrrReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const result = await context.supabase.rpc("platform_reconcile_mrr" as never);
    if (result.error) {
      if (result.error.code === "42883" || result.error.code === "PGRST202") {
        return {
          ready: false as const,
          state: "unavailable" as const,
          rows: [],
          missingFromStore: 0,
          extraInStore: 0,
          drift: 0,
          message:
            "Stored MRR reconciliation appears after the movement migration is applied. This is not a zero balance.",
        };
      }
      throw new Error(result.error.message);
    }
    const parsed = reconciliationPayload.parse(result.data);
    return { ready: true as const, ...parsed, message: null };
  });

const cohortCount = z.number().int().nonnegative();
const cohortMonth = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  trialing: cohortCount,
  active: cohortCount,
  past_due: cohortCount,
  cancelled: cohortCount,
  expired: cohortCount,
  complimentary: cohortCount,
  paused: cohortCount,
  other: cohortCount,
  total: cohortCount,
});
const cohortPayload = z.object({
  unknownStart: cohortCount,
  months: z.array(cohortMonth),
});

export const getPlatformSubscriptionCohorts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const result = await context.supabase.rpc("platform_subscription_cohorts" as never);
    if (result.error) {
      if (
        result.error.code === "42883" ||
        result.error.code === "PGRST202" ||
        result.error.code === "42703"
      ) {
        return {
          ready: false as const,
          unknownStart: 0,
          months: [],
          message:
            "Subscription start months appear after the start-date migration is applied. Existing rows are not assigned to a month from their last update. This is not revenue.",
        };
      }
      throw new Error(result.error.message);
    }
    const parsed = cohortPayload.parse(result.data);
    return { ready: true as const, ...parsed, message: null };
  });

// This capability is unavailable until the reviewed supervised-support migration is applied.
export const getSupervisedSupport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<import("./support").SupportState> => {
    const { isMissingSupportSchema } = await import("./support");
    const result = await context.supabase.rpc("platform_supervised_support_list" as never);
    setResponseHeader("Cache-Control", "private, no-store");
    if (isMissingSupportSchema(result.error)) return { ready: false, rows: [] };
    return { ready: true, rows: unwrap<import("./support").SupportRequest[]>(result) };
  });
export const requestSupervisedSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(async (value: unknown) =>
    (await import("./support")).supportRequestSchema.parse(value),
  )
  .handler(async ({ context, data }) =>
    unwrap<string>(
      await context.supabase.rpc(
        "platform_request_break_glass" as never,
        {
          _company_id: data.companyId,
          _reason: data.reason,
          _expires_at: new Date(Date.now() + data.minutes * 60_000).toISOString(),
          _request_id: data.requestId,
        } as never,
      ),
    ),
  );
export const revokeSupervisedSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(async (value: unknown) => (await import("./support")).supportRevokeSchema.parse(value))
  .handler(async ({ context, data }) =>
    unwrap<void>(
      await context.supabase.rpc(
        "platform_revoke_break_glass" as never,
        {
          _grant_id: data.id,
          _reason: data.reason,
        } as never,
      ),
    ),
  );

export const searchPlatform = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(async (value: unknown) =>
    (await import("./navigation")).platformSearchSchema.parse(value),
  )
  .handler(async ({ context, data }) => {
    const { searchHitSchema } = await import("./navigation");
    return searchHitSchema
      .array()
      .max(20)
      .parse(
        unwrap<unknown>(
          await context.supabase.rpc("platform_global_search", { _query: data.query }),
        ),
      );
  });
export const getPlatformRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(async (value: unknown) =>
    (await import("./navigation")).platformRecordSchema.parse(value),
  )
  .handler(async ({ context, data }) =>
    unwrap<import("./navigation").PlatformRecord>(
      await context.supabase.rpc("platform_record", { _resource: data.resource, _id: data.id }),
    ),
  );
