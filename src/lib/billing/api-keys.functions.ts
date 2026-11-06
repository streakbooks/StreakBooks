import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Platform API keys for REST v1; the raw key is shown once and only its hash is stored. */
type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

export const API_SCOPES = ["billing:read", "billing:analytics"] as const;

export type ApiKeyRow = {
  id: string;
  label: string;
  scopes: string[];
  createdAt: string;
  retiredAt: string | null;
  lastUsedAt: string | null;
};

const reason = z.string().trim().min(3).max(500);

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }) =>
      (await callRpc(context.supabase, "platform_list_api_keys")) as ApiKeyRow[],
  );

export const issueApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        replaceId: z.string().uuid().nullable(),
        label: z.string().trim().min(1).max(80),
        reason,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const raw = (await callRpc(context.supabase, "platform_rotate_api_key", {
      _key_id: data.replaceId,
      _label: data.label,
      _reason: data.reason,
    })) as string;
    return { key: raw };
  });

export const setApiKeyScopes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        keyId: z.string().uuid(),
        scopes: z.array(z.enum(API_SCOPES)).max(API_SCOPES.length),
        reason,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_set_api_key_scopes", {
      _key_id: data.keyId,
      _scopes: data.scopes,
      _reason: data.reason,
    });
    return { ok: true as const };
  });
