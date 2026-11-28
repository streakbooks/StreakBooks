/** Server/client guard when required Supabase env vars are absent. */
export function missingSupabaseEnvMessage(missing: string[]): string {
  const list = missing.join(", ");
  const isDev = typeof process !== "undefined" && process.env["NODE_ENV"] !== "production";
  if (isDev) {
    return `Missing Supabase environment variable(s): ${list}. Add them to .env.local (server-only; never VITE_*). Service role: Supabase Dashboard → Settings → API, or run docs/local-test-guide.md.`;
  }
  return `Missing Supabase environment variable(s): ${list}. Configure the server environment for this deployment.`;
}
