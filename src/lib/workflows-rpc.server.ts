import type { assertCompanyPermission } from "@/lib/assert-company-access";
export async function workflowRpc<T>(
  db: Parameters<typeof assertCompanyPermission>[0],
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await (
    db as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
    }
  ).rpc(name, args);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883")
      throw new Error(
        "The accounting workflow database migration must be applied before using this action.",
      );
    throw new Error(error.message);
  }
  return data as T;
}
