import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const chain = {
      middleware() {
        return chain;
      },
      inputValidator(fn: (input: unknown) => unknown) {
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
import { auditDeferralLedger } from "./deferral-ledger-audit.functions";

const companyId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const journalId = "33333333-3333-4333-8333-333333333333";
const entryId = "44444444-4444-4444-8444-444444444444";

const tables: Record<string, unknown[]> = {
  deferral_schedules: [
    {
      id: scheduleId,
      name: "Expense recognition",
      total_minor: "100",
      periods: 1,
      debit_account_id: "expense",
      credit_account_id: "asset",
    },
  ],
  deferral_entries: [
    { id: entryId, period_no: 1, amount_minor: "100", journal_id: journalId },
  ],
  journals: [
    {
      id: journalId,
      status: "posted",
      idempotency_key: `deferral:${entryId}`,
      reversed_by_journal_id: null,
    },
  ],
  journal_lines: [
    { journal_id: journalId, account_id: "expense", debit_minor: "100", credit_minor: "0" },
    { journal_id: journalId, account_id: "asset", debit_minor: "0", credit_minor: "100" },
  ],
};

const filters = vi.fn();
const from = vi.fn((table: string) => {
  const query = {
    select() {
      return query;
    },
    eq(column: string, value: unknown) {
      filters(table, column, value);
      return query;
    },
    in() {
      return query;
    },
    order() {
      return query;
    },
    async limit() {
      return { data: tables[table], error: null };
    },
    async single() {
      return { data: tables[table]?.[0] ?? null, error: null };
    },
  };
  return query;
});

const run = (id = companyId) =>
  (auditDeferralLedger as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId: id, scheduleId },
    context: { supabase: { from } },
  });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("deferral journal audit access and ledger reads", () => {
  it("requires accounting.view and scopes every query to the company", async () => {
    await expect(run()).resolves.toMatchObject({
      exceptionCount: 0,
      entries: [{ status: "matched" }],
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      "accounting.view",
    );
    for (const table of Object.keys(tables)) {
      expect(filters).toHaveBeenCalledWith(table, "company_id", companyId);
    }
  });

  it("does not query tables when accounting.view is denied", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(run()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects invalid company IDs before any database access", () => {
    expect(() => run("invalid")).toThrow(/Invalid company id/);
    expect(from).not.toHaveBeenCalled();
  });
});
