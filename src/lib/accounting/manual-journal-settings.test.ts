import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown = (value) => value;
    const chain = {
      middleware() {
        return chain;
      },
      validator(fn: (value: unknown) => unknown) {
        validate = fn;
        return chain;
      },
      inputValidator(fn: (value: unknown) => unknown) {
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
vi.mock("@/lib/accounting/posting-engine", () => ({ postJournal: vi.fn() }));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { postJournal } from "@/lib/accounting/posting-engine";
import { postManualJournal } from "./accounting.functions";

const companyId = "10000000-0000-4000-8000-000000000001";
const accountId = "20000000-0000-4000-8000-000000000001";
const input = {
  companyId,
  journalDate: "2026-11-01",
  lines: [
    { accountId, debitMinor: 1000, creditMinor: 0 },
    { accountId, debitMinor: 0, creditMinor: 1000 },
  ],
};

function makeContext(requiredMemo: boolean) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: { accounting_require_journal_memo: requiredMemo },
      error: null,
    })),
  };
  return { supabase: { from: vi.fn(() => query) }, query };
}

describe("manual journal memo setting", () => {
  beforeEach(() => {
    vi.mocked(assertCompanyPermission).mockResolvedValue(undefined);
    vi.mocked(postJournal).mockResolvedValue({
      journalId: "30000000-0000-4000-8000-000000000001",
    });
  });

  it("blocks a manual journal without a memo when the organisation requires one", async () => {
    const { supabase } = makeContext(true);
    const invoke = postManualJournal as unknown as (args: {
      data: typeof input;
      context: { supabase: typeof supabase };
    }) => Promise<unknown>;

    await expect(invoke({ data: input, context: { supabase } })).rejects.toThrow(
      "A journal memo is required by organisation settings.",
    );
    expect(assertCompanyPermission).toHaveBeenCalledWith(supabase, companyId, "journals.manual");
    expect(postJournal).not.toHaveBeenCalled();
  });

  it("allows the same balanced journal when memo enforcement is disabled", async () => {
    const { supabase } = makeContext(false);
    const invoke = postManualJournal as unknown as (args: {
      data: typeof input;
      context: { supabase: typeof supabase };
    }) => Promise<unknown>;

    await expect(invoke({ data: input, context: { supabase } })).resolves.toEqual({
      journalId: "30000000-0000-4000-8000-000000000001",
    });
    expect(postJournal).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ company_id: companyId, source_type: "manual" }),
    );
  });
});
