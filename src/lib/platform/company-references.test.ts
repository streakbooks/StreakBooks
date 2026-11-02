import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const constraints = [
  "billing_prorations_company_fk",
  "billing_provider_reconciliations_company_fk",
  "billing_usage_drafts_company_fk",
  "billing_lifetime_payments_company_fk",
  "billing_provider_fees_company_fk",
  "platform_segment_members_company_fk",
  "company_closure_requests_company_fk",
  "break_glass_events_company_fk",
];

describe("company references", () => {
  it("requires a real business and does not cascade a delete", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102590000_company_references.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    for (const name of constraints) expect(sql).toContain(name);
    expect(sql).toContain("REFERENCES public.companies(id) ON DELETE RESTRICT");
    expect(sql).not.toContain("ON DELETE CASCADE");
    expect(sql).not.toContain("journal_lines");
  });
});
