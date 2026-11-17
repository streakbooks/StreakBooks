import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown = (x) => x;
    const chain = {
      middleware() {
        return chain;
      },
      inputValidator(fn: (x: unknown) => unknown) {
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
import {
  listReconciliationReviewCases,
  listReconciliationReviewAssignees,
  getReconciliationReviewCase,
  saveReconciliationReviewCase,
} from "./reconciliation-review.functions";

const company = "11111111-1111-4111-8111-111111111111";
const uuid = "22222222-2222-4222-8222-222222222222";
const fp = "f" + "a".repeat(32);
const row = {
  id: uuid,
  company_id: company,
  source_type: "fixed_assets",
  finding_fingerprint: fp,
  title: "Fixed Asset expense mismatch",
  detail: "GL debit differs",
  severity: "error",
  version: 1,
  source_reference: "depreciation-run-1",
  journal_id: null,
  status: "open",
  assigned_to: null,
  created_by: uuid,
  updated_by: uuid,
  created_at: "2026-11-06T00:00:00Z",
  updated_at: "2026-11-06T00:00:00Z",
};
let db: Record<string, unknown[]>;
const seen = vi.fn();
const from = vi.fn((table: string) => {
  const filters: Array<(v: Record<string, unknown>) => boolean> = [];
  const q = {
    select() {
      return q;
    },
    eq(k: string, v: unknown) {
      seen(table, k, v);
      filters.push((x) => x[k] === v);
      return q;
    },
    order() {
      return q;
    },
    async maybeSingle() {
      const data = (db[table] ?? []).filter((x) =>
        filters.every((f) => f(x as Record<string, unknown>)),
      );
      return { data: data[0] ?? null, error: null };
    },
    async limit(n: number) {
      const data = (db[table] ?? [])
        .filter((x) => filters.every((f) => f(x as Record<string, unknown>)))
        .slice(0, n);
      return { data, error: null };
    },
  };
  return q;
});
const rpc = vi.fn(
  async (
    _name: string,
    _args: unknown,
  ): Promise<{
    data: {
      id: string;
      status: string;
      version: number;
      assigned_to: null;
      updated_at: string;
    } | null;
    error: { message: string } | null;
  }> => ({
    data: {
      id: uuid,
      status: "open",
      version: 1,
      assigned_to: null,
      updated_at: "2026-11-06T00:00:00Z",
    },
    error: null,
  }),
);
const context = { supabase: { from, rpc } };
const invoke = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context });
const read = (id = company) => invoke(listReconciliationReviewCases, { companyId: id });
const assignees = (id = company) => invoke(listReconciliationReviewAssignees, { companyId: id });
const exact = (id = company, source = "fixed_assets", fingerprint = fp) =>
  invoke(getReconciliationReviewCase, { companyId: id, source, fingerprint });
const saveInput = {
  companyId: company,
  source: "fixed_assets",
  fingerprint: fp,
  action: "open",
  finding: {
    title: "Fixed Asset expense mismatch",
    detail: "GL debit differs",
    severity: "error",
    journalId: null,
    reference: "run-1",
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  db = {
    reconciliation_review_cases: [row],
    company_members: [{ user_id: uuid, company_id: company, role: "accountant", status: "active" }],
  };
  rpc.mockResolvedValue({
    data: {
      id: uuid,
      status: "open",
      version: 1,
      assigned_to: null,
      updated_at: "2026-11-06T00:00:00Z",
    },
    error: null,
  });
});
describe("persistent reconciliation review server permissions and boundaries", () => {
  it("reads only company review cases with accounting.view before tables", async () => {
    await expect(read()).resolves.toMatchObject({
      cases: [expect.objectContaining({ finding_fingerprint: fp })],
      hasMore: false,
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      company,
      "accounting.view",
    );
    expect(seen).toHaveBeenCalledWith("reconciliation_review_cases", "company_id", company);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("blocks unauthorized case reads before any database call", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("No read permission"));
    await expect(read()).rejects.toThrow("No read permission");
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects invalid company IDs for read and write requests", () => {
    expect(() => read("not-a-uuid")).toThrow(/Invalid company id/);
    expect(() => invoke(saveReconciliationReviewCase, { ...saveInput, companyId: "bad" })).toThrow(
      /Invalid company id/,
    );
  });
  it("fails closed on a foreign review row in the backend response", async () => {
    db["reconciliation_review_cases"] = [{ ...row, company_id: "foreign" }];
    await expect(read()).resolves.toMatchObject({ cases: [] });
  });
  it("finds an exact current case using company, source and stable fingerprint", async () => {
    await expect(exact()).resolves.toMatchObject({ id: uuid, version: 1 });
    expect(seen).toHaveBeenCalledWith("reconciliation_review_cases", "company_id", company);
    expect(seen).toHaveBeenCalledWith("reconciliation_review_cases", "source_type", "fixed_assets");
    expect(seen).toHaveBeenCalledWith("reconciliation_review_cases", "finding_fingerprint", fp);
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      company,
      "accounting.view",
    );
  });
  it("finds no case for an unrelated source and refuses foreign-company evidence", async () => {
    await expect(exact(company, "payroll")).resolves.toBeNull();
    db["reconciliation_review_cases"] = [{ ...row, company_id: "other" }];
    await expect(exact()).resolves.toBeNull();
  });
  it("fails an exact lookup before queries when accounting.view is denied", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("No view permission"));
    await expect(exact()).rejects.toThrow("No view permission");
    expect(from).not.toHaveBeenCalled();
  });
  it("validates exact case lookup keys before database access", () => {
    expect(() => exact(company, "other")).toThrow(/Invalid reconciliation source/);
    expect(() => exact(company, "fixed_assets", "bad")).toThrow(
      /Invalid reconciliation finding fingerprint/,
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("limits the queue to 100 and discloses additional rows", async () => {
    db["reconciliation_review_cases"] = Array.from({ length: 101 }, (_, i) => ({
      ...row,
      id: "case-" + i,
    }));
    await expect(read()).resolves.toMatchObject({
      hasMore: true,
      cases: expect.any(Array),
    });
    const result = (await read()) as { cases: unknown[] };
    expect(result.cases).toHaveLength(100);
  });
  it("writes through RPC only after both accounting.view and accounting.post checks", async () => {
    await invoke(saveReconciliationReviewCase, saveInput);
    expect(assertCompanyPermission).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      company,
      "accounting.view",
    );
    expect(assertCompanyPermission).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      company,
      "accounting.post",
    );
    expect(rpc).toHaveBeenCalledWith(
      "save_reconciliation_review_case",
      expect.objectContaining({
        _company_id: company,
        _source_type: "fixed_assets",
        _fingerprint: fp,
        _action: "open",
        _expected_version: null,
      }),
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("stops writes on accounting.post denial", async () => {
    vi.mocked(assertCompanyPermission)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("No posting rights"));
    await expect(invoke(saveReconciliationReviewCase, saveInput)).rejects.toThrow(
      "No posting rights",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires exact version for updates and no version for opening", () => {
    expect(() =>
      invoke(saveReconciliationReviewCase, {
        ...saveInput,
        expectedVersion: 1,
      }),
    ).toThrow(/Review versions/);
    expect(() =>
      invoke(saveReconciliationReviewCase, {
        ...saveInput,
        action: "status",
        expectedVersion: null,
      }),
    ).toThrow(/Review versions/);
    expect(() =>
      invoke(saveReconciliationReviewCase, {
        ...saveInput,
        action: "comment",
        expectedVersion: 1.5,
      }),
    ).toThrow(/Review versions/);
  });
  it("validates permitted sources, actions and fingerprint format", () => {
    expect(() =>
      invoke(saveReconciliationReviewCase, {
        ...saveInput,
        source: "other",
      }),
    ).toThrow(/source/);
    expect(() =>
      invoke(saveReconciliationReviewCase, {
        ...saveInput,
        action: "resolved",
      }),
    ).toThrow(/action/);
    expect(() =>
      invoke(saveReconciliationReviewCase, {
        ...saveInput,
        fingerprint: "not-a-fingerprint",
      }),
    ).toThrow(/fingerprint/);
  });
  it("validates finding journal UUID and note limits before RPC", () => {
    expect(() =>
      invoke(saveReconciliationReviewCase, {
        ...saveInput,
        finding: { ...saveInput.finding, journalId: "not-a-uuid" },
      }),
    ).toThrow(/Invalid finding journal id/);
    expect(() =>
      invoke(saveReconciliationReviewCase, {
        ...saveInput,
        note: "x".repeat(2001),
      }),
    ).toThrow(/Review comment/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("supports assigned reviewer and status changes only as versioned operations", async () => {
    await invoke(saveReconciliationReviewCase, {
      ...saveInput,
      finding: undefined,
      action: "assign",
      assignedTo: uuid,
      expectedVersion: 2,
    });
    expect(rpc).toHaveBeenCalledWith(
      "save_reconciliation_review_case",
      expect.objectContaining({ _action: "assign", _assigned_to: uuid, _expected_version: 2 }),
    );
    await invoke(saveReconciliationReviewCase, {
      ...saveInput,
      finding: undefined,
      action: "status",
      status: "blocked",
      note: "Awaiting evidence",
      expectedVersion: 3,
    });
    expect(rpc).toHaveBeenCalledWith(
      "save_reconciliation_review_case",
      expect.objectContaining({ _action: "status", _status: "blocked", _expected_version: 3 }),
    );
  });
  it("propagates database RPC failure rather than reporting a save", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Concurrent review changed" } });
    await expect(invoke(saveReconciliationReviewCase, saveInput)).rejects.toThrow(
      "Concurrent review changed",
    );
  });
  it("requires both accounting.view and members.view for member selector", async () => {
    await expect(assignees()).resolves.toMatchObject({
      members: [{ user_id: uuid, role: "accountant" }],
      hasMore: false,
    });
    expect(assertCompanyPermission).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      company,
      "accounting.view",
    );
    expect(assertCompanyPermission).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      company,
      "members.view",
    );
    expect(seen).toHaveBeenCalledWith("company_members", "company_id", company);
    expect(seen).toHaveBeenCalledWith("company_members", "status", "active");
  });
  it("does not expose member rows if members.view is denied", async () => {
    vi.mocked(assertCompanyPermission)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("No member list"));
    await expect(assignees()).rejects.toThrow("No member list");
    expect(from).not.toHaveBeenCalled();
  });
  it("bounds team member results at 100 and marks additional rows", async () => {
    db["company_members"] = Array.from({ length: 101 }, (_, i) => ({
      ...(db["company_members"]![0] as object),
      user_id: "member-" + i,
    }));
    await expect(assignees()).resolves.toMatchObject({ hasMore: true });
    const r = (await assignees()) as { members: unknown[] };
    expect(r.members).toHaveLength(100);
  });
});
