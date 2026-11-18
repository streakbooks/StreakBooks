import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "./rpc";

const identity = z.object({
  companyId: z.string().uuid(),
  bankTransactionId: z.string().uuid(),
  historyId: z.string().uuid(),
});

export const recordCodingFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    identity
      .extend({ state: z.enum(["accepted", "edited", "rejected"]), requestId: z.string().uuid() })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "banking.categorise");
    await assertCompanyPermission(context.supabase, data.companyId, "banking.view");
    return callRpc<string>(context.supabase, "record_bank_coding_feedback", {
      _company_id: data.companyId,
      _bank_transaction_id: data.bankTransactionId,
      _history_id: data.historyId,
      _state: data.state,
      _request_id: data.requestId,
    });
  });

export const setCodingMemoryPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    identity.extend({ enabled: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "banking.categorise");
    await assertCompanyPermission(context.supabase, data.companyId, "banking.view");
    // An invoker RPC applies the update under caller RLS and the existing MFA policy.
    return callRpc<string>(context.supabase, "set_bank_coding_memory_preference", {
      _company_id: data.companyId,
      _bank_transaction_id: data.bankTransactionId,
      _history_id: data.historyId,
      _enabled: data.enabled,
    });
  });
