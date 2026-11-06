import { createClient } from "@supabase/supabase-js";

export type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
export type RpcClient = { rpc: (fn: never, args?: never) => PromiseLike<RpcResult> };

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function publicConfig(): { url: string; key: string } {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured on the server.");
  return { url, key };
}

/** Client acting as the caller: every RPC runs with their JWT and the database's checks. */
export function userClient(token: string) {
  const { url, key } = publicConfig();
  return createClient(url, key, {
    global: { fetch: supabaseFetch(key), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/** Client with no session, for public RPCs. */
export function anonymousClient() {
  const { url, key } = publicConfig();
  return createClient(url, key, {
    global: { fetch: supabaseFetch(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
