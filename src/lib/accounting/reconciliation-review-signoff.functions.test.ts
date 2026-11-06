import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown = x => x;
    const chain = {
      middleware() { return chain; },
      inputValidator(fn: (data: unknown) => unknown) { validate = fn; return chain; },
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
import {
  listReconciliationReviewHistory, progressReconciliationReviewCase,
} from "./reconciliation-review-signoff.functions";

const company = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const uid = "33333333-3333-4333-8333-333333333333";
const originalCase = { id: caseId, company_id: company };
const event = {
  id: "event-one", company_id: company, case_id: caseId,
  actor_id: uid, action: "open", note: "Started investigation",
  old_state: null, new_state: { status: "open", version: 1 },
  created_at: "2026-11-06T10:00:00Z",
};
let tables: Record<string, unknown[]>;
let errorTable: string | null = null;
const seen = vi.fn();
const from = vi.fn((table: string) => {
  const filters: Array<(item: Record<string, unknown>) => boolean> = [];
  const q = {
    select() { return q; },
    eq(key: string, value: unknown) {
      seen(table, key, value);
      filters.push(item => item[key] === value);
      return q;
    },
    order() { return q; },
    async maybeSingle() {
      const data = (tables[table] ?? [])
        .filter(row => filters.every(f => f(row as Record<string, unknown>)));
      return { data: data[0] ?? null,
        error: errorTable === table ? { message: "Simulated database failure" } : null };
    },
    async limit(n: number) {
      const data = (tables[table] ?? [])
        .filter(row => filters.every(f => f(row as Record<string, unknown>)))
        .slice(0, n);
      return { data, error: errorTable === table ? { message: "Simulated database failure" } : null };
    },
  };
  return q;
});
const rpc = vi.fn(async (): Promise<{ data: unknown; error: { message: string } | null }> => ({
  data: { id: caseId, status: "in_review", version: 4,
    assigned_to: uid, updated_at: "2026-11-06T12:00:00Z",
    evidence_url: "https://example.com/report", submitted_by: null, reviewed_by: null },
  error: null,
}));
const context = { supabase: { from, rpc } };
const invoke = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context });
const history = (id=company, caseKey=caseId) =>
  invoke(listReconciliationReviewHistory, { companyId: id, caseId: caseKey });
const progressInput = {
  companyId: company, caseId, action: "attach_evidence",
  expectedVersion: 3, note: "Source audit attached",
  evidenceUrl: "https://example.com/report",
};
const progress = (overrides: Record<string, unknown> = {}) =>
  invoke(progressReconciliationReviewCase, { ...progressInput, ...overrides });

beforeEach(() => {
  vi.resetAllMocks();
  tables = {
    reconciliation_review_cases: [originalCase],
    reconciliation_review_events: [event],
  };
  errorTable = null;
  rpc.mockResolvedValue({
    data: { id: caseId, status: "in_review", version: 4,
      assigned_to: uid, updated_at: "2026-11-06T12:00:00Z",
      evidence_url: "https://example.com/report", submitted_by: null, reviewed_by: null },
    error: null,
  });
});

describe("persistent reconciliation review progression and history", () => {
  it("loads case history after accounting.view and scoped case lookup", async () => {
    const result = await history();
    expect(result).toMatchObject({
      events: [expect.objectContaining({ id: "event-one", action: "open" })],
      hasMore: false,
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(), company, "accounting.view",
    );
    for (const table of ["reconciliation_review_cases", "reconciliation_review_events"]) {
      expect(seen).toHaveBeenCalledWith(table, "company_id", company);
    }
    expect(seen).toHaveBeenCalledWith("reconciliation_review_events", "case_id", caseId);
  });
  it("denies history read before querying on missing accounting.view", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Forbidden"));
    await expect(history()).rejects.toThrow("Forbidden");
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects invalid company or case UUIDs", () => {
    expect(() => history("no")).toThrow("Invalid company id");
    expect(() => history(company, "bad")).toThrow(/Invalid review case id/);
    expect(() => progress({ caseId: "invalid" })).toThrow(/Invalid review case id/);
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects absent, foreign or mismatched review case evidence", async () => {
    tables["reconciliation_review_cases"] = [];
    await expect(history()).rejects.toThrow(/not found/);
    tables["reconciliation_review_cases"] = [{ id: caseId, company_id: "another-tenant" }];
    await expect(history()).rejects.toThrow(/not found/);
  });
  it("fails closed if events are unexpectedly cross-company or cross-case", async () => {
    tables["reconciliation_review_events"] = [{ ...event, company_id: "other" }];
    await expect(history()).resolves.toMatchObject({ events: [] });
    tables["reconciliation_review_events"] = [{ ...event, case_id: "wrong" }];
    await expect(history()).resolves.toMatchObject({ events: [] });
  });
  it("bounds history at 100 and exposes hasMore", async () => {
    tables["reconciliation_review_events"] = Array.from({ length: 101 }, (_, i) =>
      ({ ...event, id: "event-" + i }));
    const result = await history() as { events: unknown[]; hasMore: boolean };
    expect(result.events).toHaveLength(100);
    expect(result.hasMore).toBe(true);
  });
  it("does not replace a database error with an empty history", async () => {
    errorTable = "reconciliation_review_events";
    await expect(history()).rejects.toThrow("Simulated database failure");
    errorTable = "reconciliation_review_cases";
    await expect(history()).rejects.toThrow("Simulated database failure");
  });
  it("checks both accounting permissions before writing by RPC", async () => {
    await expect(progress()).resolves.toMatchObject({ version: 4 });
    expect(assertCompanyPermission).toHaveBeenNthCalledWith(
      1, expect.anything(), company, "accounting.view",
    );
    expect(assertCompanyPermission).toHaveBeenNthCalledWith(
      2, expect.anything(), company, "accounting.post",
    );
    expect(rpc).toHaveBeenCalledWith("progress_reconciliation_review_case", expect.objectContaining({
      _company_id: company, _case_id: caseId,
      _action: "attach_evidence", _expected_version: 3,
      _evidence_url: "https://example.com/report",
    }));
    expect(from).not.toHaveBeenCalled();
  });
  it("blocks write when either accounting.view or accounting.post is denied", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("No viewing"));
    await expect(progress()).rejects.toThrow("No viewing");
    expect(rpc).not.toHaveBeenCalled();
    vi.mocked(assertCompanyPermission).mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("No posting"));
    await expect(progress()).rejects.toThrow("No posting");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects unsupported actions including resolved and direct posting", () => {
    expect(() => progress({ action: "resolved" })).toThrow("Invalid review progression action");
    expect(() => progress({ action: "post_journal" })).toThrow("Invalid review progression action");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires a current positive safe version", () => {
    for (const version of [0, -1, 2.2, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => progress({ expectedVersion: version })).toThrow(/version/);
    }
  });
  it("rejects http, javascript, whitespace, excessive URLs and non-HTTPS links", () => {
    for (const url of [
      "http://example.com", "javascript:alert(1)", "https://example.com/a b",
      "https://example.com/" + "x".repeat(500), "https://example.com/\nfoo",
    ]) {
      expect(() => progress({ evidenceUrl: url })).toThrow(/HTTPS URL/);
    }
  });
  it("requires evidence and appropriate investigation notes", () => {
    expect(() => progress({ evidenceUrl: null })).toThrow(/Evidence or conclusion/);
    expect(() => progress({ note: "hi" })).toThrow(/Evidence or conclusion/);
    expect(() => progress({ action: "submit", evidenceUrl: null, note: "short" }))
      .toThrow(/Evidence or conclusion/);
  });
  it("supports submission, independent signoff and reopen request shapes", async () => {
    for (const action of ["submit", "sign_off", "reopen"]) {
      await progress({ action, evidenceUrl: null, note: "Detailed review conclusion" });
      expect(rpc).toHaveBeenCalledWith("progress_reconciliation_review_case",
        expect.objectContaining({
          _action: action, _evidence_url: null, _expected_version: 3,
        }));
    }
  });
  it("propagates database failure and does not report success without saved result", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Version changed" } });
    await expect(progress()).rejects.toThrow("Version changed");
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(progress()).rejects.toThrow(/no versioned evidence/);
  });
  it("rejects overlong notes in review progression", () => {
    expect(() => progress({ note: "a".repeat(2001) })).toThrow(/at most 2000/);
  });
});
