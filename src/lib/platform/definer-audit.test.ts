import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const anonSql = readFileSync(
  new URL("../../../supabase/migrations/20261102180000_definer_anon_execute.sql", import.meta.url),
  "utf8",
);
const pathSql = readFileSync(
  new URL("../../../supabase/migrations/20261102180100_function_search_path.sql", import.meta.url),
  "utf8",
);

describe("security-definer migration", () => {
  it("keeps the three public reads executable by anonymous callers", () => {
    for (const name of [
      "list_live_feature_prices",
      "list_public_billing_plans",
      "get_shared_invoice",
    ]) {
      expect(anonSql).not.toContain(`FUNCTION public.${name}`);
    }
  });

  it("revokes the public grant on signed-in and trigger functions", () => {
    expect(anonSql).toContain(
      "REVOKE ALL ON FUNCTION public.reset_demo_company(_company_id uuid) FROM PUBLIC",
    );
    expect(anonSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.reset_demo_company(_company_id uuid) TO authenticated, service_role",
    );
  });

  it("pins search_path on the nine mutable functions", () => {
    expect(pathSql.match(/SET search_path = pg_catalog, public;/g)).toHaveLength(9);
  });
});
