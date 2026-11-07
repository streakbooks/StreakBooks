/**
 * Seeds every module (expenses, payroll, fixed assets, budgets, tax, reports, products, files,
 * accountant, contacts, firm, advisors portal, app store, action center) for a Demo Company.
 * The database function checks the company is a demo and posts through each module's own
 * functions; it reports per module so one failure never blocks the rest.
 */
export type DemoModuleReport = Record<string, { ok: boolean; detail: string; where?: string }>;

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

export async function seedDemoModules(
  supabase: unknown,
  companyId: string,
): Promise<DemoModuleReport | null> {
  const { data, error } = await (supabase as RpcClient).rpc(
    "seed_demo_modules" as never,
    { _company_id: companyId } as never,
  );
  if (error) {
    // Older databases without the module seed keep the core demo working.
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error(error.message);
  }
  return (data ?? {}) as DemoModuleReport;
}

export function summariseDemoModules(report: DemoModuleReport | null): {
  seeded: number;
  total: number;
  failed: string[];
} {
  const entries = Object.entries(report ?? {});
  const failed = entries.filter(([, value]) => !value.ok).map(([name]) => name);
  return { seeded: entries.length - failed.length, total: entries.length, failed };
}
