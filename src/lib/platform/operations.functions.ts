import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  opsApplySchema,
  opsDetailSchema,
  opsListSchema,
  opsLookupSchema,
  opsMembersSchema,
} from "./operations";
import type { OpsContext, OpsRecord, OpsDetail, OpsOption, OpsResult } from "./operations";
function unwrap<T>(r: { data: unknown; error: { message: string } | null }): T {
  setResponseHeader("Cache-Control", "private, no-store");
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
export const getOpsContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap<OpsContext>(await context.supabase.rpc("platform_ops_context")),
  );
export const listOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => opsListSchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<{ rows: OpsRecord[]; total: number; pageSize: number }>(
      await context.supabase.rpc("platform_ops_list", {
        _module: data.module,
        _search: data.search,
        _status: data.status,
        ...(data.company ? { _company: data.company } : {}),
        _page: data.page,
      }),
    ),
  );
export const getOpsDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => opsDetailSchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<OpsDetail>(
      await context.supabase.rpc("platform_ops_detail", { _module: data.module, _id: data.id }),
    ),
  );
export const lookupOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => opsLookupSchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<{ rows: OpsOption[]; total: number }>(
      await context.supabase.rpc("platform_ops_lookup", {
        _kind: data.kind,
        _search: data.search,
        _page: data.page,
      }),
    ),
  );
export const listOpsMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => opsMembersSchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<{ rows: OpsOption[]; total: number }>(
      await context.supabase.rpc("platform_ops_members", {
        _id: data.id,
        _search: data.search,
        _page: data.page,
      }),
    ),
  );
export const applyOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => opsApplySchema.parse(v))
  .handler(async ({ context, data }) =>
    unwrap<OpsResult>(
      await context.supabase.rpc("platform_ops_apply", {
        _command: data.command,
        _payload: data.payload,
        _reason: data.reason,
        _request_id: data.requestId,
      }),
    ),
  );
export const previewOpsMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        mode: z.enum(["add", "remove"]),
        companyIds: z.array(z.string().uuid()).min(1).max(100),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ rowVersion: number; rows: (OpsOption & { changes: boolean })[]; changed: number }>(
      await context.supabase.rpc("platform_ops_member_preview", {
        _id: data.id,
        _mode: data.mode,
        _company_ids: data.companyIds,
      }),
    ),
  );
