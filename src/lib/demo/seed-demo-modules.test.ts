import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seedDemoModules, summariseDemoModules } from "./seed-demo-modules";

const sql = readFileSync("supabase/migrations/20261107170051_demo_all_modules.sql", "utf8");
const MODULES = [
  "expenses",
  "payroll",
  "fixed_assets",
  "budgets",
  "tax",
  "reports",
  "products",
  "accounting",
  "files",
  "accountant",
  "contacts",
  "firm",
  "advisors",
  "app_store",
];

describe("demo module seed", () => {
  it("has a seed function for every module and runs each one", () => {
    for (const module of MODULES) {
      expect(sql, module).toContain(`FUNCTION private.demo_seed_${module}(_c uuid, _u uuid)`);
      expect(sql, module).toContain(`'${module}'`);
    }
  });

  it("only seeds and resets demo companies", () => {
    expect(sql).toMatch(/seed_demo_modules[\s\S]*is_demo[\s\S]*not a demo company/);
    expect(sql).toMatch(
      /reset_demo_module_data[\s\S]*AND is_demo\) THEN\s+RAISE EXCEPTION 'Reset denied/,
    );
    expect(sql).toContain("has_company_permission(_company_id, 'demo.reset')");
  });

  it("clears module data and journal-linked documents before the base reset", () => {
    const wrapper = sql.slice(sql.indexOf("FUNCTION private.reset_demo_company_with_workflows"));
    const base = wrapper.indexOf("PERFORM private.reset_demo_company_before_workflows");
    for (const statement of [
      "PERFORM private.reset_demo_module_data(_company)",
      "DELETE FROM public.sales_invoices WHERE company_id = _company",
      "DELETE FROM public.recurring_templates WHERE company_id = _company",
      "DELETE FROM public.reconciliation_links WHERE company_id = _company",
    ]) {
      expect(wrapper.indexOf(statement), statement).toBeGreaterThan(0);
      expect(wrapper.indexOf(statement), statement).toBeLessThan(base);
    }
    const reset = sql.slice(sql.indexOf("FUNCTION private.reset_demo_module_data"));
    for (const table of [
      "payroll_runs",
      "fixed_assets",
      "budgets",
      "document_attachments",
      "app_installations",
    ]) {
      expect(reset).toContain(`DELETE FROM public.${table} WHERE company_id = _c`);
    }
  });

  it("never fakes connected apps or emails anyone", () => {
    const appStore = sql.slice(sql.indexOf("FUNCTION private.demo_seed_app_store"));
    expect(appStore.slice(0, appStore.indexOf("END $$;"))).not.toMatch(/'connected'|'installed'/);
    const reports = sql.slice(sql.indexOf("FUNCTION private.demo_seed_reports"));
    expect(reports.slice(0, reports.indexOf("END $$;"))).toMatch(
      /'previous_month', 'Europe\/London'[\s\S]*false\)/,
    );
  });

  it("summarises the per-module report", () => {
    expect(
      summariseDemoModules({
        expenses: { ok: true, detail: "18 claims" },
        payroll: { ok: false, detail: "boom" },
      }),
    ).toEqual({ seeded: 1, total: 2, failed: ["payroll"] });
    expect(summariseDemoModules(null)).toEqual({ seeded: 0, total: 0, failed: [] });
  });

  it("tolerates databases without the module seed", async () => {
    const missing = {
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "not found" } }),
    };
    await expect(seedDemoModules(missing, "c")).resolves.toBeNull();
    const failing = {
      rpc: async () => ({
        data: null,
        error: { code: "42501", message: "Demo seed access denied" },
      }),
    };
    await expect(seedDemoModules(failing, "c")).rejects.toThrow("Demo seed access denied");
  });
});
