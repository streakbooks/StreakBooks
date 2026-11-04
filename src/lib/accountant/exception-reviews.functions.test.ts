import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown = (value) => value;
    return {
      middleware() {
        return this;
      },
      inputValidator(fn: (value: unknown) => unknown) {
        validate = fn;
        return this;
      },
      handler(fn: (args: { data: unknown; context: unknown }) => unknown) {
        return (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));

import {
  listAccountantExceptionReviews,
  listAccountantExceptionEvents,
  saveAccountantExceptionReview,
} from "./exception-reviews.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";

const companyId = "00000000-0000-4000-8000-000000000001";
const journalId = "00000000-0000-4000-8000-000000000002";
const reviewId = "00000000-0000-4000-8000-000000000003";
const findingKey = journalId + ":missing_memo";
const calls: Array<[string, ...unknown[]]> = [];

function db() {
  const builder = {
    select() { return this; },
    eq(key: string, value: unknown) { calls.push(["eq", key, value]); return this; },
    in(key: string, value: unknown) { calls.push(["in", key, value]); return this; },
    order() { return this; },
    limit(value: number) { calls.push(["limit", value]); return Promise.resolve({ data: [], error: null }); },
  };
  return {
    from(table: string) { calls.push(["from", table]); return builder; },
    rpc(name: string, args: unknown) {
      calls.push(["rpc", name, args]);
      return Promise.resolve({ data: { id: reviewId, version: 2, status: "investigating" }, error: null });
    },
  };
}

const list = listAccountantExceptionReviews as unknown as (args: unknown) => Promise<unknown[]>;
const events = listAccountantExceptionEvents as unknown as (args: unknown) => Promise<unknown[]>;
const save = saveAccountantExceptionReview as unknown as (args: unknown) => Promise<unknown>;

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("accountant exception review server boundary", () => {
  it("scopes review reads to the requested tenant and explicit posted-journal identifiers", async () => {
    const client = db();
    await list({ data: { companyId, journalIds: [journalId] }, context: { supabase: client } });
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "accounting.view");
    expect(calls).toEqual(expect.arrayContaining([
      ["from", "accountant_journal_exception_reviews"],
      ["eq", "company_id", companyId],
      ["in", "journal_id", [journalId]],
      ["limit", 5000],
    ]));
  });

  it("rejects unauthorized callers before any table read", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("No access"));
    await expect(
      list({ data: { companyId, journalIds: [journalId] }, context: { supabase: db() } }),
    ).rejects.toThrow("No access");
    expect(calls).toHaveLength(0);
  });

  it("validates multi-journal requests and finding identity before making writes", async () => {
    await expect(
      list({ data: { companyId, journalIds: [] }, context: { supabase: db() } }),
    ).rejects.toThrow();
    await expect(
      save({
        data: {
          companyId,
          journalId,
          findingKey: "forged:missing_memo",
          action: "investigate",
          note: "",
          version: null,
        },
        context: { supabase: db() },
      }),
    ).rejects.toThrow();
    await expect(
      save({
        data: {
          companyId,
          journalId,
          findingKey,
          action: "approve",
          note: "x",
          version: 2,
        },
        context: { supabase: db() },
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("performs only an authorized RPC for resolution updates", async () => {
    const client = db();
    const record = await save({
      data: {
        companyId,
        journalId,
        findingKey,
        action: "submit",
        note: "Documented investigation",
        version: 1,
      },
      context: { supabase: client },
    });
    expect(record).toMatchObject({ id: reviewId, version: 2 });
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "accounting.post");
    expect(calls).toEqual(expect.arrayContaining([
      ["rpc", "save_accountant_journal_exception", expect.objectContaining({
        _company_id: companyId,
        _journal_id: journalId,
        _finding_key: findingKey,
        _action: "submit",
        _expected_version: 1,
      })],
    ]));
    expect(calls.some((call) => call[0] === "from")).toBe(false);
  });

  it("reads immutable history only by company and review identifier", async () => {
    const client = db();
    await events({
      data: { companyId, reviewId },
      context: { supabase: client },
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "accounting.view");
    expect(calls).toEqual(expect.arrayContaining([
      ["from", "accountant_journal_exception_events"],
      ["eq", "company_id", companyId],
      ["eq", "review_id", reviewId],
      ["limit", 100],
    ]));
  });
});
