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
import { auditPostedGlEvidence } from "./posted-gl-evidence.functions";

const companyId = "11111111-1111-4111-8111-111111111111";
const journalId = "22222222-2222-4222-8222-222222222222";
const journal = {
  id: journalId,
  company_id: companyId,
  journal_number: 1,
  journal_date: "2026-11-06",
  status: "posted",
  currency_code: "GBP",
  source_type: "manual",
  reverses_journal_id: null,
  reversed_by_journal_id: null,
};
const baseTables: Record<string, unknown[]> = {
  journals: [journal],
  journal_lines: [
    {
      id: "l1",
      company_id: companyId,
      journal_id: journalId,
      line_no: 1,
      account_id: "a1",
      debit_minor: "50",
      credit_minor: "0",
    },
    {
      id: "l2",
      company_id: companyId,
      journal_id: journalId,
      line_no: 2,
      account_id: "a2",
      debit_minor: "0",
      credit_minor: "50",
    },
  ],
  accounts: [
    { id: "a1", company_id: companyId, code: "1000", name: "Cash" },
    { id: "a2", company_id: companyId, code: "2000", name: "Liability" },
  ],
  accounting_periods: [
    {
      id: "period-1",
      company_id: companyId,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      status: "locked",
    },
  ],
};
const tables: Record<string, unknown[]> = {};
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
    lte() {
      return query;
    },
    gte() {
      return query;
    },
    in() {
      return query;
    },
    order() {
      return query;
    },
    async maybeSingle() {
      return { data: tables[table]?.[0] ?? null, error: null };
    },
    async limit() {
      return { data: tables[table] ?? [], error: null };
    },
  };
  return query;
});
const run = (id = companyId, j = journalId) =>
  (auditPostedGlEvidence as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId: id, journalId: j },
    context: { supabase: { from } },
  });

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of Object.keys(baseTables)) tables[key] = [...baseTables[key]!];
});

describe("posted GL evidence API authorisation and bounded queries", () => {
  it("checks accounting.view before any data and scopes every query to the requested company", async () => {
    await expect(run()).resolves.toMatchObject({ status: "passed", debitMinor: "50" });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      "accounting.view",
    );
    for (const name of ["journals", "journal_lines", "accounts", "accounting_periods"]) {
      expect(companyFilters).toHaveBeenCalledWith(name, "company_id", companyId);
    }
  });
  it("does not read a single GL row after permission denial", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(run()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects invalid company and journal IDs before accessing data", () => {
    expect(() => run("not-a-uuid")).toThrow();
    expect(() => run(companyId, "invalid")).toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it("fails closed on a foreign journal header even if the query stub returned it", async () => {
    tables["journals"] = [{ ...journal, company_id: "other" }];
    await expect(run()).rejects.toThrow(/organisation/);
  });
  it("rejects truncated ledger evidence rather than reporting a false pass", async () => {
    tables["journal_lines"] = Array.from({ length: 501 }, (_, i) => ({
      ...(baseTables["journal_lines"]![0] as object),
      id: "line-" + i,
      line_no: i + 1,
    }));
    await expect(run()).rejects.toThrow(/500-line limit/);
  });
  it("returns an explicit exception when the account record is absent", async () => {
    tables["accounts"] = [baseTables["accounts"]![0]!];
    await expect(run()).resolves.toMatchObject({ status: "exceptions" });
  });
  it("checks journal reversals with a separate scoped lookup", async () => {
    tables["journals"] = [
      {
        ...journal,
        reversed_by_journal_id: "33333333-3333-4333-8333-333333333333",
      },
    ];
    await expect(run()).resolves.toMatchObject({ status: "exceptions" });
    const scopedJournalQueries = companyFilters.mock.calls.filter(
      (args) => args[0] === "journals" && args[1] === "company_id",
    );
    expect(scopedJournalQueries.length).toBe(2);
  });
});
