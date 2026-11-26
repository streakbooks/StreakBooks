import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const chain = {
      middleware() {
        return chain;
      },
      validator(fn: (input: unknown) => unknown) {
        validate = fn;
        return chain;
      },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { auditRecentRealisedFx } from "./fx-ledger-audit.functions";

const companyId = "11111111-1111-4111-8111-111111111111";
const allocationId = "22222222-2222-4222-8222-222222222222";
const journalId = "33333333-3333-4333-8333-333333333333";
const tables: Record<string, unknown[]> = {
  fx_realised_postings: [
    {
      id: "fx1",
      kind: "sales",
      allocation_id: allocationId,
      currency_code: "USD",
      gain_loss_base_minor: "125",
      journal_id: journalId,
      reversal_journal_id: null,
      reversed_at: null,
    },
  ],
  journals: [
    {
      id: journalId,
      status: "posted",
      source_type: "fx_realised",
      source_id: allocationId,
      idempotency_key: `fx_realised:sales:${allocationId}:post`,
      reversed_by_journal_id: null,
    },
  ],
  journal_lines: [
    { journal_id: journalId, debit_minor: "125", credit_minor: "0" },
    { journal_id: journalId, debit_minor: "0", credit_minor: "125" },
  ],
  fx_journal_tags: [{ journal_id: journalId, kind: "realised", currency_code: "USD" }],
};
const companyFilters = vi.fn();
const from = vi.fn((table: string) => {
  const query = {
    select() {
      return query;
    },
    eq(field: string, value: unknown) {
      companyFilters(table, field, value);
      return query;
    },
    neq() {
      return query;
    },
    order() {
      return query;
    },
    in() {
      return query;
    },
    async limit() {
      return { data: tables[table], error: null };
    },
  };
  return query;
});
const run = (id = companyId) =>
  (auditRecentRealisedFx as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId: id },
    context: { supabase: { from } },
  });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("realised FX ledger audit server access", () => {
  it("requires accounting.view and company-scopes every source table", async () => {
    await expect(run()).resolves.toMatchObject({
      rowsChecked: 1,
      exceptions: 0,
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      "accounting.view",
    );
    for (const table of Object.keys(tables)) {
      expect(companyFilters).toHaveBeenCalledWith(table, "company_id", companyId);
    }
  });

  it("does not query any financial data after permission denial", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(run()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects invalid organisation identifiers before making any database calls", () => {
    expect(() => run("not-a-uuid")).toThrow(/Invalid company id/);
    expect(from).not.toHaveBeenCalled();
  });
});
