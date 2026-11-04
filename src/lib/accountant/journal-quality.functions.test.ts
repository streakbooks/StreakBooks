import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    inputValidator() {
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));

import { scanManualJournalQuality } from "./journal-quality.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";

const calls: Array<{ method: string; column?: string; value?: unknown }> = [];
const base = {
  id: "journal-1",
  journal_number: 1,
  journal_date: "2026-11-01",
  memo: "Manual accrual",
  currency_code: "GBP",
  source_type: "manual",
  status: "posted",
  reverses_journal_id: null,
  reversed_by_journal_id: null,
  journal_lines: [
    { account_id: "expense", debit_minor: 200, credit_minor: 0 },
    { account_id: "accrual", debit_minor: 0, credit_minor: 200 },
  ],
};

function supabase(rows: unknown[]) {
  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push({ method: "eq", column, value });
      return builder;
    },
    gte(column: string, value: unknown) {
      calls.push({ method: "gte", column, value });
      return builder;
    },
    lte(column: string, value: unknown) {
      calls.push({ method: "lte", column, value });
      return builder;
    },
    order() {
      return builder;
    },
    limit(value: number) {
      calls.push({ method: "limit", value });
      return builder;
    },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(resolve({ data: rows, error: null }));
    },
  };
  return {
    from(table: string) {
      calls.push({ method: "from", value: table });
      return builder;
    },
  };
}

const run = scanManualJournalQuality as unknown as (args: unknown) => Promise<{
  scanned: number;
  limited: boolean;
  findings: Array<{ kind: string }>;
}>;

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("live journal quality scan boundary", () => {
  it("scopes posted manual journals to the authenticated company and requested dates", async () => {
    const result = await run({
      data: {
        companyId: "client",
        from: "2026-10-01",
        to: "2026-11-04",
      },
      context: { supabase: supabase([base]) },
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      "client",
      "accounting.view",
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        { method: "from", value: "journals" },
        { method: "eq", column: "company_id", value: "client" },
        { method: "eq", column: "status", value: "posted" },
        { method: "eq", column: "source_type", value: "manual" },
        { method: "gte", column: "journal_date", value: "2026-10-01" },
        { method: "lte", column: "journal_date", value: "2026-11-04" },
        { method: "limit", value: 501 },
      ]),
    );
    expect(result).toMatchObject({ scanned: 1, limited: false, findings: [] });
  });

  it("fails closed before querying any ledger table when authorization is rejected", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Access denied"));
    await expect(
      run({
        data: { companyId: "other", from: "2026-11-01", to: "2026-11-04" },
        context: { supabase: supabase([]) },
      }),
    ).rejects.toThrow("Access denied");
    expect(calls).toHaveLength(0);
  });

  it("does not imply full coverage after the 500-entry scan limit", async () => {
    const records = Array.from({ length: 501 }, (_, index) => ({
      ...base,
      id: "j-" + index,
      memo: "Unique narration " + index,
      journal_number: index + 1,
    }));
    const result = await run({
      data: { companyId: "client", from: "2026-01-01", to: "2026-11-04" },
      context: { supabase: supabase(records) },
    });
    expect(result.scanned).toBe(500);
    expect(result.limited).toBe(true);
    expect(result.findings).toEqual([]);
  });
});
