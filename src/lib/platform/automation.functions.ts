import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { automationActionSchema, automationReadSchema } from "./automation";
import type { AutomationContext, AutomationRow } from "./automation";
function unwrap<T>(r: { data: unknown; error: { message: string } | null }): T {
  setResponseHeader("Cache-Control", "private, no-store");
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
export const getAutomationContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap<AutomationContext>(
      await context.supabase.rpc("platform_automation_read", { _module: "context" }),
    ),
  );
export const readAutomation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => automationReadSchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<{ rows: AutomationRow[]; total: number }>(
      await context.supabase.rpc("platform_automation_read", {
        _module: data.module,
        _search: data.search,
        _status: data.status,
        _page: data.page,
        ...(data.id ? { _id: data.id } : {}),
      }),
    ),
  );
export const actAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => automationActionSchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<{ id: string; record: AutomationRow }>(
      await context.supabase.rpc("platform_automation_action", {
        _command: data.command,
        _payload: data.payload,
        _reason: data.reason,
        _request_id: data.requestId,
      }),
    ),
  );
