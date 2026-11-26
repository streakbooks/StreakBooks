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
import { auditFxRevaluationLedger } from "./fx-revaluation-ledger-audit.functions";

const companyId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const journalId = "33333333-3333-4333-8333-333333333333";
const tables: Record<string, unknown[]> = {
  companies: [{ id: companyId, base_currency: "GBP" }],
  fx_revaluation_runs: [
    {
      id: runId,
      as_of_date: "2026-10-31",
      reverse_on: "2026-11-01",
      journal_ids: [journalId],
      total_gain_minor: "120",
      total_loss_minor: "0",
    },
  ],
  journal_auto_reversals: [
    {
      journal_id: journalId,
      origin: "fx_revaluation",
      status: "pending",
      reverse_on: "2026-11-01",
      reversal_journal_id: null,
    },
  ],
  fx_journal_tags: [{ journal_id: journalId, currency_code: "USD", kind: "revaluation" }],
  journals: [
    {
      id: journalId,
      status: "posted",
      journal_date: "2026-10-31",
      source_type: "fx_revaluation",
      source_id: runId,
      idempotency_key: `fx_reval:${runId}:USD`,
      currency_code: "GBP",
      fx_rate_to_base: "1.00000000",
      reverses_journal_id: null,
      reversed_by_journal_id: null,
    },
  ],
  journal_lines: [
    { journal_id: journalId, account_id: "asset", debit_minor: "120", credit_minor: "0" },
    { journal_id: journalId, account_id: "gain", debit_minor: "0", credit_minor: "120" },
  ],
  accounts: [
    { id: "asset", code: "1100", name: "Trade receivables", account_type: "asset" },
    { id: "gain", code: "7720", name: "Unrealised FX gains", account_type: "income" },
  ],
};

const filters = vi.fn();
const from = vi.fn((table: string) => {
  const q = {
    select() {
      return q;
    },
    eq(column: string, value: unknown) {
      filters(table, column, value);
      return q;
    },
    in() {
      return q;
    },
    async single() {
      return { data: tables[table]?.[0] ?? null, error: null };
    },
    async limit() {
      return { data: tables[table], error: null };
    },
  };
  return q;
});
const call = (id = companyId, selectedRun = runId) =>
  (auditFxRevaluationLedger as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId: id, runId: selectedRun },
    context: { supabase: { from } },
  });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("unrealised FX journal audit server security", () => {
  it("requires accounting.view and scopes every ledger table to the selected company", async () => {
    await expect(call()).resolves.toMatchObject({
      runId,
      expectedGainMinor: "120",
      actualGainMinor: "120",
      exceptionCount: 0,
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      "accounting.view",
    );
    for (const table of Object.keys(tables)) {
      expect(filters).toHaveBeenCalledWith(
        table,
        table === "companies" ? "id" : "company_id",
        companyId,
      );
    }
  });

  it("denied permissions prevent every ledger query", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(call()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });

  it("invalid organisation and run identifiers fail before database access", () => {
    expect(() => call("bad-id")).toThrow(/Invalid company id/);
    expect(() => call(companyId, "bad-id")).toThrow(/Invalid run id/);
    expect(from).not.toHaveBeenCalled();
  });
});
