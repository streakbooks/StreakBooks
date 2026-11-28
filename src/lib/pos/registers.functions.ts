import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  posWorkspaceSchema,
  parseCreatePosRegister,
  parsePosSessionCommand,
  parsePosLocationAccess,
  type PosCreateRegisterInput,
  type PosSessionCommand,
  type PosLocationAccessInput,
} from "./register-contracts";

type Client = Parameters<typeof assertCompanyPermission>[0];
async function command(client: Client, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883")
      throw new Error(
        "POS register database upgrade is not available. Ask your administrator to complete the reviewed migration.",
      );
    throw new Error(error.message);
  }
  return data as unknown;
}
export const getPosWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.view");
    return posWorkspaceSchema.parse(
      await command(context.supabase, "pos_get_workspace", { _company_id: data.companyId }),
    );
  });
export const createPosRegister = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PosCreateRegisterInput) => parseCreatePosRegister(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.settings.manage");
    return {
      id: assertUuid(
        await command(context.supabase, "pos_create_register", {
          _company_id: data.companyId,
          _register_id: data.registerId,
          _location_id: data.locationId,
          _cash_account_id: data.cashAccountId,
          _code: data.code,
          _name: data.name,
        }),
        "register",
      ),
    };
  });
export const setPosLocationAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PosLocationAccessInput) => parsePosLocationAccess(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.settings.manage");
    await command(context.supabase, "pos_set_location_access", {
      _company_id: data.companyId,
      _location_id: data.locationId,
      _user_id: data.userId,
      _allowed: data.allowed,
    });
    return { updated: true };
  });
export const openPosSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PosSessionCommand) => parsePosSessionCommand(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.register.open");
    return {
      id: assertUuid(
        await command(context.supabase, "pos_open_session", {
          _company_id: data.companyId,
          _register_id: data.targetId,
          _operation_id: data.operationId,
          _opening_float_minor: data.amountMinor,
        }),
        "session",
      ),
    };
  });
export const closePosSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PosSessionCommand) => parsePosSessionCommand(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.register.close");
    await assertCompanyPermission(context.supabase, data.companyId, "pos.cash.count");
    return {
      id: assertUuid(
        await command(context.supabase, "pos_close_session", {
          _company_id: data.companyId,
          _session_id: data.targetId,
          _operation_id: data.operationId,
          _closing_count_minor: data.amountMinor,
        }),
        "session",
      ),
    };
  });
