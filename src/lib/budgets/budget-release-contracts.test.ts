import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * These contract checks run without a database, but do NOT replace a migration
 * replay, RLS two-tenant regression, browser QA, or a production deployment review.
 */
const migrationNames = [
  "20261106115500_duplicate_budget.sql",
  "20261106173000_budget_governance_revisions.sql",
  "20261106182000_budget_atomic_document_save.sql",
  "20261106193000_budget_approval_workflows.sql",
  "20261106204000_budget_dimension_allocations.sql",
  "20261106214000_budget_forecast_scenarios.sql",
] as const;

const sql = (filename: string) =>
  readFileSync(resolve(process.cwd(), "supabase", "migrations", filename), "utf8");

describe("Budgets release: six pending migrations", () => {
  it("exists in the intended dependency order", () => {
    const dates = migrationNames.map((name) => name.slice(0, 14));
    expect([...dates].sort()).toEqual(dates);
    for (const filename of migrationNames) {
      expect(sql(filename).length).toBeGreaterThan(100);
    }
  });

  it.each(migrationNames)("%s has balanced SQL dollar-quoted function bodies", (filename) => {
    const text = sql(filename);
    // Defend against accidentally changing AS $$ to AS $ in a committed migration.
    expect(text).not.toMatch(/^\s*AS \$(?:\r?\n|$)/m);
    expect(text).not.toMatch(/^\s*\$;\s*$/m);
    const open = text.match(/^\s*AS \$\$\s*$/gm) ?? [];
    const close = text.match(/^\s*\$\$;\s*$/gm) ?? [];
    expect(open.length).toBeGreaterThan(0);
    expect(close.length).toBe(open.length);
  });

  it.each(migrationNames)("%s includes authentication and company permissions", (filename) => {
    const text = sql(filename);
    expect(text).toContain("auth.uid()");
    expect(text).toContain("public.is_company_member");
    expect(text).toContain("public.has_company_permission");
    expect(text).toMatch(/SECURITY DEFINER/);
    expect(text).toMatch(/SET search_path = ''/);
  });

  it("enforces read-only tenant-scoped budget revision history", () => {
    const text = sql(migrationNames[1]);
    for (const table of ["budget_governance", "budget_revisions"]) {
      expect(text).toContain("public." + table + " ENABLE ROW LEVEL SECURITY");
    }
    expect(text).toContain("FOR SELECT TO authenticated");
    expect(text).toContain("REVOKE ALL ON public.budget_governance, public.budget_revisions");
    expect(text).toContain("FROM PUBLIC, anon, authenticated;");
    expect(text).toContain("AFTER INSERT OR UPDATE ON public.budgets");
    expect(text).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("locks both headers and amount lines at database level", () => {
    const text = sql(migrationNames[1]);
    expect(text).toContain("BEFORE UPDATE OR DELETE ON public.budgets");
    expect(text).toContain("BEFORE INSERT OR UPDATE OR DELETE ON public.budget_lines");
    expect(text).toContain("Budget is locked.");
  });

  it("protects atomic saves with a stale-write token and held budget row lock", () => {
    const text = sql(migrationNames[2]);
    expect(text).toContain("_expected_updated_at");
    expect(text).toContain("FOR UPDATE;");
    expect(text).toContain("IS DISTINCT FROM _expected_updated_at");
    expect(text).toContain("PERFORM public.save_budget(");
    expect(text).toContain("SELECT public.save_budget_lines(");
    expect(text).toContain("Budget is locked;");
  });

  it("requires an independent reviewer and freezes approved and pending plans", () => {
    const text = sql(migrationNames[3]);
    expect(text).toContain("_previous.submitted_by IS NOT DISTINCT FROM _actor");
    expect(text).toContain("requester cannot approve or reject");
    expect(text).toContain("a.status IN ('pending', 'approved')");
    expect(text).toContain("budget_approval_guard_header");
    expect(text).toContain("budget_approval_guard_lines");
    expect(text).toContain("public.budget_approval_state ENABLE ROW LEVEL SECURITY");
  });

  it("prevents dimension allocations exceeding account-month budget amounts", () => {
    const text = sql(migrationNames[4]);
    expect(text).toContain("SUM(d.amount_minor::NUMERIC) > COALESCE(");
    expect(text).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(text).toContain("budget_dimension_guard_changes");
    expect(text).toContain("public.budget_dimension_revisions ENABLE ROW LEVEL SECURITY");
  });

  it("hardens legacy Budgets direct grants and SECURITY DEFINER search paths", () => {
    const text = sql("20261106224500_budget_release_grants_hardening.sql");
    expect(text).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/);
    expect(text).toContain("ON public.budgets, public.budget_lines");
    expect(text).toContain("FROM PUBLIC, anon, authenticated;");
    expect(text).toContain("GRANT SELECT ON public.budgets, public.budget_lines TO authenticated;");
    for (const functionName of ["save_budget", "save_budget_lines", "delete_budget"]) {
      expect(text).toContain("ALTER FUNCTION public." + functionName + "(");
    }
    expect((text.match(/SET search_path = '';/g) ?? []).length).toBe(3);
  });

  it("stores forecast assumptions separately from journal and base-budget amounts", () => {
    const text = sql(migrationNames[5]);
    expect(text).toContain("public.budget_forecast_scenarios ENABLE ROW LEVEL SECURITY");
    expect(text).toContain("public.budget_forecast_scenario_events ENABLE ROW LEVEL SECURITY");
    expect(text).toContain("IS DISTINCT FROM _expected_updated_at");
    expect(text).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.(?:journals|journal_lines|budget_lines)\b/i);
    expect(text).toContain("GRANT SELECT ON public.budget_forecast_scenarios");
  });
});
