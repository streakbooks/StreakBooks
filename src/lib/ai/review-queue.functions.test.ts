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
      handler(fn: (value: { data: unknown; context: unknown }) => unknown) {
        return async (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));

import {
  listAiJournalReviewCases,
  getAiJournalReviewCase,
  exportAiJournalReviewAudit,
  listAiJournalReviewEvents,
  saveAiJournalReview,
  reviewActionSchema,
} from "./review-queue.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";

const companyId = "00000000-0000-4000-8000-000000000001";
const journalId = "00000000-0000-4000-8000-000000000002";
const caseId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";
const calls: Array<[string, ...unknown[]]> = [];
const input = {
  companyId,
  journalId,
  caseId,
  action: "comment" as const,
  note: "Checked posted journal document",
  assignedTo: null,
  expectedVersion: 1,
};

function db(eventCount = 0, competingUpdate = false) {
  let selectedCase = 0;
  const auditEvents = Array.from({ length: eventCount }, (_, index) => ({
    id: caseId,
    action: "comment",
    actor_id: userId,
    note: "A review note " + index,
    previous_status: "open",
    new_status: "open",
    assigned_to: null,
    created_at: "2026-11-06T09:00:00Z",
  }));
  const builder = {
    select() {
      return this;
    },
    eq(key: string, value: unknown) {
      calls.push(["eq", key, value]);
      return this;
    },
    order() {
      return this;
    },
    range(from = 0, to = 24) {
      calls.push(["range", from, to]);
      if (to === from + 199)
        return Promise.resolve({ data: auditEvents.slice(from, to + 1), error: null });
      return Promise.resolve({ data: [], count: 0, error: null });
    },
    maybeSingle() {
      selectedCase++;
      return Promise.resolve({
        data: {
          id: caseId,
          version: competingUpdate && selectedCase > 1 ? 2 : 1,
        },
        error: null,
      });
    },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
  };
  return {
    from(table: string) {
      calls.push(["from", table]);
      return builder;
    },
    rpc(fn: string, args: unknown) {
      calls.push(["rpc", fn, args]);
      return Promise.resolve({ data: { id: caseId, status: "assigned", version: 2 }, error: null });
    },
  };
}
const list = listAiJournalReviewCases as unknown as (args: unknown) => Promise<unknown>;
const history = listAiJournalReviewEvents as unknown as (args: unknown) => Promise<unknown>;
const fetchOne = getAiJournalReviewCase as unknown as (args: unknown) => Promise<unknown>;
const exportAudit = exportAiJournalReviewAudit as unknown as (args: unknown) => Promise<unknown>;
const save = saveAiJournalReview as unknown as (args: unknown) => Promise<unknown>;

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("AI review queue server authorization and transitions", () => {
  it("enforces AI and reporting permission before reading the queue", async () => {
    const client = db();
    await list({
      data: { companyId, page: 0, status: "all", assignedToMe: false },
      context: { supabase: client, userId },
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "ai.use");
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "reports.view");
    expect(calls).toEqual(
      expect.arrayContaining([
        ["from", "ai_journal_review_cases"],
        ["eq", "company_id", companyId],
      ]),
    );
  });

  it("rejects a denied caller before reading or writing any review row", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Access denied"));
    await expect(
      list({ data: { companyId }, context: { supabase: db(), userId } }),
    ).rejects.toThrow("Access denied");
    expect(calls).toHaveLength(0);
  });

  it("does not permit creating a forged case with a preset ID or version", () => {
    expect(() => reviewActionSchema.parse({ ...input, action: "open" })).toThrow();
    expect(() =>
      reviewActionSchema.parse({ ...input, action: "open", caseId: null, expectedVersion: null }),
    ).not.toThrow();
    expect(() =>
      reviewActionSchema.parse({
        ...input,
        action: "open",
        caseId: null,
        expectedVersion: null,
        assignedTo: userId,
      }),
    ).toThrow();
  });

  it("rejects mutations without current optimistic-lock version", () => {
    expect(() => reviewActionSchema.parse({ ...input, expectedVersion: null })).toThrow();
    expect(() => reviewActionSchema.parse({ ...input, expectedVersion: 0 })).toThrow();
    expect(() => reviewActionSchema.parse({ ...input, caseId: null })).toThrow();
  });

  it("requires meaningful comments, sign-off and reopening reasons", () => {
    expect(() => reviewActionSchema.parse({ ...input, note: " " })).toThrow();
    expect(() =>
      reviewActionSchema.parse({ ...input, action: "sign_off", note: "short" }),
    ).toThrow();
    expect(() => reviewActionSchema.parse({ ...input, action: "reopen", note: "short" })).toThrow();
    expect(() =>
      reviewActionSchema.parse({ ...input, action: "sign_off", note: "Reviewed the source." }),
    ).not.toThrow();
  });

  it("requires a reviewer when assigning", () => {
    expect(() => reviewActionSchema.parse({ ...input, action: "assign" })).toThrow();
    expect(() =>
      reviewActionSchema.parse({ ...input, action: "assign", assignedTo: userId }),
    ).not.toThrow();
  });

  it("uses the one atomic, version-checked DB RPC and never directly edits a journal", async () => {
    const client = db();
    await save({ data: input, context: { supabase: client, userId } });
    expect(calls).toEqual(
      expect.arrayContaining([
        [
          "rpc",
          "save_ai_journal_review",
          expect.objectContaining({
            _company_id: companyId,
            _journal_id: journalId,
            _case_id: caseId,
            _action: "comment",
            _expected_version: 1,
          }),
        ],
      ]),
    );
    expect(calls.some((c) => c[0] === "from")).toBe(false);
  });

  it("requires reviewer permissions for assignments and completed sign-off", async () => {
    const client = db();
    await save({
      data: { ...input, action: "assign", assignedTo: userId },
      context: { supabase: client, userId },
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "ai.apply_suggestion");
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "members.view");
    vi.clearAllMocks();
    await save({ data: { ...input, action: "sign_off" }, context: { supabase: client, userId } });
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "ai.apply_suggestion");
  });

  it("rejects invalid review actions and unrecognised company IDs before RPC", async () => {
    await expect(
      save({
        data: { ...input, action: "post_journal" },
        context: { supabase: db(), userId },
      }),
    ).rejects.toThrow();
    await expect(
      save({
        data: { ...input, companyId: "malformed" },
        context: { supabase: db(), userId },
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("scopes event history to the company and selected review case", async () => {
    const client = db();
    await history({ data: { companyId, caseId }, context: { supabase: client, userId } });
    expect(calls).toEqual(
      expect.arrayContaining([
        ["from", "ai_journal_review_cases"],
        ["eq", "company_id", companyId],
        ["eq", "id", caseId],
        ["from", "ai_journal_review_events"],
        ["eq", "case_id", caseId],
      ]),
    );
  });

  it("loads a deep-linked AI case by company and case ID, not by current page", async () => {
    const client = db();
    await fetchOne({
      data: { companyId, caseId },
      context: { supabase: client, userId },
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "ai.use");
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "reports.view");
    expect(calls).toEqual(
      expect.arrayContaining([
        ["from", "ai_journal_review_cases"],
        ["eq", "company_id", companyId],
        ["eq", "id", caseId],
      ]),
    );
  });

  it("rejects an unauthorised deep-linked case before reading rows", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Access denied"));
    await expect(
      fetchOne({
        data: { companyId, caseId },
        context: { supabase: db(), userId },
      }),
    ).rejects.toThrow("Access denied");
    expect(calls).toHaveLength(0);
  });

  it("requires reports.export on top of AI and reporting visibility for audit exports", async () => {
    const client = db();
    await exportAudit({ data: { companyId, caseId }, context: { supabase: client, userId } });
    for (const permission of ["ai.use", "reports.view", "reports.export"])
      expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, permission);
    expect(calls).toContainEqual(["from", "ai_journal_review_cases"]);
    expect(calls).toContainEqual(["from", "ai_journal_review_events"]);
  });

  it("refuses unprivileged exports before reading audit records", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Export denied"));
    await expect(
      exportAudit({ data: { companyId, caseId }, context: { supabase: db(), userId } }),
    ).rejects.toThrow("Export denied");
    expect(calls).toHaveLength(0);
  });

  it("exports complete bounded case history, not just the last 100 events", async () => {
    const result = (await exportAudit({
      data: { companyId, caseId },
      context: { supabase: db(135), userId },
    })) as { events: unknown[] };
    expect(result.events).toHaveLength(135);
    expect(calls).toContainEqual(["eq", "company_id", companyId]);
    expect(calls).toContainEqual(["eq", "case_id", caseId]);
  });

  it("fetches all audit event pages when the provider caps individual responses", async () => {
    const result = (await exportAudit({
      data: { companyId, caseId },
      context: { supabase: db(435), userId },
    })) as { events: unknown[] };
    expect(result.events).toHaveLength(435);
    expect(calls).toContainEqual(["range", 0, 199]);
    expect(calls).toContainEqual(["range", 200, 399]);
    expect(calls).toContainEqual(["range", 400, 599]);
  });

  it("refuses to label an export complete if another reviewer changes the case during pagination", async () => {
    await expect(
      exportAudit({
        data: { companyId, caseId },
        context: { supabase: db(201, true), userId },
      }),
    ).rejects.toThrow(/changed during audit export/);
  });

  it("fails closed rather than generating a truncated export over 5,000 events", async () => {
    await expect(
      exportAudit({
        data: { companyId, caseId },
        context: { supabase: db(5001), userId },
      }),
    ).rejects.toThrow(/no incomplete file/);
  });

  it("supports a server-filtered assigned-to-me queue without exposing other tenants", async () => {
    const client = db();
    await list({
      data: { companyId, page: 1, status: "assigned", assignedToMe: true },
      context: { supabase: client, userId },
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", "company_id", companyId],
        ["eq", "status", "assigned"],
        ["eq", "assigned_to", userId],
      ]),
    );
  });
});
