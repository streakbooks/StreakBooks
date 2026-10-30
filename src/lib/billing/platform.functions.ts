import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { resolveBillingRegion } from "@/lib/billing/region";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "platform_owner" | "platform_finance" | "platform_support";

function asRole(value: unknown): Role | null {
  if (value === "platform_owner" || value === "platform_finance" || value === "platform_support") {
    return value;
  }
  return null;
}

async function requirePlatformRole(
  supabase: {
    rpc: (fn: "platform_role") => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  },
  allowed: Role[],
): Promise<Role> {
  const { data, error } = await supabase.rpc("platform_role");
  if (error) throw new Error(error.message);
  const role = asRole(data);
  if (!role || !allowed.includes(role)) {
    throw new Error(
      "This console is limited to platform staff. Organisation admins cannot open it.",
    );
  }
  return role;
}

export const getPlatformBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await requirePlatformRole(context.supabase as never, [
      "platform_owner",
      "platform_finance",
      "platform_support",
    ]);
    const supabaseAdmin = context.supabase;
    const [versions, prices, costs] = await Promise.all([
      supabaseAdmin
        .from("plan_versions" as never)
        .select("*" as never)
        .order("plan_code" as never),
      supabaseAdmin.from("plan_prices" as never).select("*" as never),
      supabaseAdmin.from("billing_cost_inputs" as never).select("*" as never),
    ]);
    if (versions.error) throw new Error(versions.error.message);
    if (prices.error) throw new Error(prices.error.message);
    if (costs.error) throw new Error(costs.error.message);
    return {
      role,
      versions: versions.data ?? [],
      prices: prices.data ?? [],
      costs: costs.data ?? [],
    };
  });

export const bootstrapPlatformOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error(
      "Platform owners require privileged database provisioning. Online self-promotion is disabled.",
    );
  });

export const listPublicBillingPlans = createServerFn({ method: "GET" }).handler(async () => {
  // Region is request-specific: never cache one visitor\u0027s price for another.
  setResponseHeader("Cache-Control", "private, no-store");
  const region = resolveBillingRegion({ visitorCountry: getRequestHeader("x-vercel-ip-country") });
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return { ready: false as const, plans: [], ...region };
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("list_public_billing_plans" as never);
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202" || error.code === "42P01") {
      return { ready: false as const, plans: [], ...region };
    }
    throw new Error(error.message);
  }
  return { ready: true as const, plans: data ?? [], ...region };
});
