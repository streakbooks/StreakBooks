import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown = (value) => value;
    return {
      middleware() {
        return this;
      },
      validator(fn: (value: unknown) => unknown) {
        validate = fn;
        return this;
      },
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
import { getAiWorkpaperEvidence, workpaperEvidenceInput } from "./workpaper-handoff.functions";

const companyId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const journalId = "33333333-3333-4333-8333-333333333333";
const reviewId = "44444444-4444-4444-8444-444444444444";
const params = { companyId, accountId, asOf: "2026-11-06", page: 0 };
const calls: Array<[string, ...unknown[]]> = [];
const row = {
  review_id: reviewId,
  journal_id: journalId,
  journal_number: 13,
  journal_date: "2026-11-04",
  journal_status: "posted",
  source_type: "manual",
  review_status: "reviewed",
  reviewed_by: accountId,
  reviewed_at: "2026-11-05T10:00:00Z",
  updated_at: "2026-11-05T10:00:00Z",
};

function db(
  options: {
    rows?: (typeof row)[];
    total?: number;
    page?: number;
    pageSize?: number;
    error?: string;
  } = {},
) {
  return {
    rpc(name: string, args: unknown) {
      calls.push(["rpc", name, args]);
      if (options.error) return Promise.resolve({ data: null, error: { message: options.error } });
      return Promise.resolve({
        data: {
          total: options.total ?? 1,
          page: options.page ?? 0,
          pageSize: options.pageSize ?? 25,
          rows: options.rows ?? [row],
        },
        error: null,
      });
    },
  };
}
const load = getAiWorkpaperEvidence as unknown as (args: unknown) => Promise<unknown>;
beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("AI workpaper evidence complete pagination boundary", () => {
  it("requires accounting, AI, and report permission before accessing pagination RPC", async () => {
    const client = db();
    const out = await load({ data: params, context: { supabase: client } });
    for (const permission of ["accounting.view", "ai.use", "reports.view"])
      expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, permission);
    expect(out).toMatchObject({
      total: 1,
      pageSize: 25,
      page: 0,
      pageCounts: { reviewed: 1, followUp: 0, notPosted: 0 },
    });
  });

  it("rejects denied permission before any RPC and never directly accesses ledger tables", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Access denied"));
    await expect(load({ data: params, context: { supabase: db() } })).rejects.toThrow(
      "Access denied",
    );
    expect(calls).toHaveLength(0);
  });

  it("passes only validated company, account, cutoff, and page to the scoped RPC", async () => {
    await load({ data: params, context: { supabase: db() } });
    expect(calls).toEqual([
      [
        "rpc",
        "list_ai_workpaper_evidence_page",
        {
          _company_id: companyId,
          _account_id: accountId,
          _as_of: params.asOf,
          _page: 0,
        },
      ],
    ]);
  });

  it("validates real calendar dates, UUIDs and page bounds", () => {
    expect(() => workpaperEvidenceInput.parse({ ...params, asOf: "2026-02-30" })).toThrow();
    expect(() => workpaperEvidenceInput.parse({ ...params, accountId: "x" })).toThrow();
    expect(() => workpaperEvidenceInput.parse({ ...params, page: -1 })).toThrow();
    expect(() => workpaperEvidenceInput.parse({ ...params, page: 10001 })).toThrow();
    expect(() => workpaperEvidenceInput.parse({ ...params, page: 1.5 })).toThrow();
  });

  it("does not truncate valid later pages even when there are more than 100 matching cases", async () => {
    const client = db({ total: 151, page: 5 });
    const out = await load({
      data: { ...params, page: 5 },
      context: { supabase: client },
    });
    expect(out).toMatchObject({ total: 151, page: 5 });
    expect((out as { links: unknown[] }).links).toHaveLength(1);
    expect(calls[0]?.[2]).toMatchObject({ _page: 5 });
  });

  it("flags no-longer-posted journals despite a previously signed-off AI review", async () => {
    const out = await load({
      data: params,
      context: { supabase: db({ rows: [{ ...row, journal_status: "reversed" }] }) },
    });
    expect(out).toMatchObject({ pageCounts: { reviewed: 0, followUp: 0, notPosted: 1 } });
  });

  it("does not misrepresent empty pages as proof of account reconciliation", async () => {
    const out = await load({
      data: params,
      context: { supabase: db({ rows: [], total: 0 }) },
    });
    expect(out).toMatchObject({
      total: 0,
      links: [],
      pageCounts: { reviewed: 0, followUp: 0, notPosted: 0 },
    });
    expect((out as { disclaimer: string }).disclaimer).toMatch(/not a workpaper sign-off/);
  });

  it("refuses invalid payload shape and page metadata", async () => {
    await expect(load({ data: params, context: { supabase: db({ total: -1 }) } })).rejects.toThrow(
      /invalid/,
    );
    await expect(load({ data: params, context: { supabase: db({ page: 2 }) } })).rejects.toThrow(
      /invalid/,
    );
    await expect(
      load({ data: params, context: { supabase: db({ pageSize: 100 }) } }),
    ).rejects.toThrow(/invalid/);
    await expect(
      load({
        data: params,
        context: { supabase: db({ rows: Array.from({ length: 26 }, () => row) }) },
      }),
    ).rejects.toThrow(/invalid/);
  });

  it("gives an actionable migration error when the new paging function is missing", async () => {
    await expect(
      load({
        data: params,
        context: {
          supabase: db({ error: "function list_ai_workpaper_evidence_page does not exist" }),
        },
      }),
    ).rejects.toThrow(/migration/);
  });
});
