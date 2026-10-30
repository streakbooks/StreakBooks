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
  .inputValidator((v: unknown) => overviewSchema.parse(v))
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
  .inputValidator((v: unknown) => listSchema.parse(v))
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
  .inputValidator((v: unknown) => mutationSchema.parse(v))
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
  .inputValidator((v: unknown) => z.object({ companyId: z.string().uuid() }).parse(v))
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
  .inputValidator((v: unknown) => z.object({ companyId: z.string().uuid().nullable() }).parse(v))
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
  .inputValidator((v: unknown) =>
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
  .inputValidator((v: unknown) =>
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
  .inputValidator((v: unknown) => listSchema.parse(v))
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
