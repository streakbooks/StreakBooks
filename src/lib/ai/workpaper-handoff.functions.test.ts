import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown = (value) => value;
    return {
      middleware() { return this; },
      inputValidator(fn: (value: unknown) => unknown) { validate = fn; return this; },
      handler(fn: (args: { data: unknown; context: unknown }) => unknown) {
        return async (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { getAiWorkpaperEvidence } from "./workpaper-handoff.functions";

const companyId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const journalId = "33333333-3333-4333-8333-333333333333";
const caseId = "44444444-4444-4444-8444-444444444444";
const params = { companyId, accountId, asOf: "2026-11-06" };
const calls: Array<[string, ...unknown[]]> = [];
const caseRecord = {
  id: caseId, journal_id: journalId, status: "reviewed",
  assigned_to: null, reviewed_by: accountId,
  reviewed_at: "2026-11-05T10:00:00Z", updated_at: "2026-11-05T10:00:00Z",
};

function db(options: {
  type?: string;
  isPostable?: boolean;
  cases?: typeof caseRecord[];
  lines?: Array<{ journal_id: string }>;
  journals?: Array<{ id: string; journal_number: number; journal_date: string; status: string; source_type: string }>;
} = {}) {
  const builder = (table: string) => ({
    select() { return this; },
    eq(key: string, value: unknown) { calls.push(["eq", table, key, value]); return this; },
    in(key: string, value: unknown) { calls.push(["in", table, key, value]); return this; },
    lte(key: string, value: unknown) { calls.push(["lte", table, key, value]); return this; },
    order() { return this; },
    maybeSingle() {
      return Promise.resolve({
        data: { id: accountId, account_type: options.type ?? "asset", is_postable: options.isPostable ?? true },
        error: null,
      });
    },
    limit() {
      if (table === "ai_journal_review_cases")
        return Promise.resolve({ data: options.cases ?? [caseRecord], error: null });
      if (table === "journal_lines")
        return Promise.resolve({ data: options.lines ?? [{ journal_id: journalId }], error: null });
      if (table === "journals")
        return Promise.resolve({ data: options.journals ?? [{
          id: journalId, journal_number: 99, journal_date: "2026-11-05",
          status: "posted", source_type: "manual",
        }], error: null });
      throw new Error("Unexpected table: " + table);
    },
  });
  return {
    from(table: string) { calls.push(["from", table]); return builder(table); },
  };
}
const get = getAiWorkpaperEvidence as unknown as (input: unknown) => Promise<unknown>;

beforeEach(() => { calls.length = 0; vi.clearAllMocks(); });

describe("accountant workpaper handoff server boundaries", () => {
  it("requires accounting, AI and reports access before any case or journal read", async () => {
    const client = db();
    const out = await get({ data: params, context: { supabase: client } });
    for (const permission of ["accounting.view", "ai.use", "reports.view"])
      expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, permission);
    expect(out).toMatchObject({ scannedReviews: 1, counts: { reviewed: 1, followUp: 0, notPosted: 0 } });
  });

  it("refuses access before touching the database when any required permission is denied", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Permission denied"));
    await expect(get({ data: params, context: { supabase: db() } })).rejects.toThrow("Permission denied");
    expect(calls).toHaveLength(0);
  });

  it("scopes all three ledger queries and review rows to the selected tenant and account", async () => {
    await get({ data: params, context: { supabase: db() } });
    expect(calls).toEqual(expect.arrayContaining([
      ["eq", "accounts", "company_id", companyId],
      ["eq", "accounts", "id", accountId],
      ["eq", "ai_journal_review_cases", "company_id", companyId],
      ["eq", "journal_lines", "company_id", companyId],
      ["eq", "journal_lines", "account_id", accountId],
      ["eq", "journals", "company_id", companyId],
      ["lte", "journals", "journal_date", params.asOf],
    ]));
  });

  it("rejects non-balance-sheet or non-postable account selections", async () => {
    await expect(get({ data: params, context: { supabase: db({ type: "income" }) } })).rejects.toThrow(/balance-sheet/);
    await expect(get({ data: params, context: { supabase: db({ isPostable: false }) } })).rejects.toThrow(/balance-sheet/);
    expect(calls.some((call) => call[0] === "from" && call[1] === "journal_lines")).toBe(false);
  });

  it("rejects forged company IDs and invalid calendar dates before DB access", async () => {
    await expect(get({ data: { ...params, companyId: journalId.slice(0, 4) }, context: { supabase: db() } })).rejects.toThrow();
    await expect(get({ data: { ...params, asOf: "2026-02-30" }, context: { supabase: db() } })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("returns an explicit no-review state without querying unrelated ledger lines", async () => {
    const out = await get({ data: params, context: { supabase: db({ cases: [] }) } });
    expect(out).toMatchObject({
      scannedReviews: 0, latestReviewsTruncated: false, links: [],
      counts: { reviewed: 0, followUp: 0, notPosted: 0 },
    });
    expect(calls.some((call) => call[0] === "from" && call[1] === "journal_lines")).toBe(false);
  });

  it("does not silently accept a line query truncated above 500 rows", async () => {
    const lines = Array.from({ length: 501 }, () => ({ journal_id: journalId }));
    await expect(get({ data: params, context: { supabase: db({ lines }) } })).rejects.toThrow(/Too many matching/);
  });

  it("reports a bounded latest-review sample as incomplete when company has more than 100 reviews", async () => {
    const cases = Array.from({ length: 101 }, (_, index) => ({
      ...caseRecord,
      id: "00000000-0000-4000-8000-" + String(index).padStart(12, "0"),
    }));
    const out = await get({ data: params, context: { supabase: db({ cases }) } });
    expect(out).toMatchObject({ scannedReviews: 100, latestReviewsTruncated: true });
    expect((out as { disclaimer: string }).disclaimer).toMatch(/older cases may be omitted/i);
  });
});
