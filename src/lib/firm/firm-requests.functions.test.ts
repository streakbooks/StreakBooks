import { describe, expect, it, vi } from "vitest";
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

import { requestInput, summarizeRequests, REQUEST_STATUSES } from "./firm-requests.functions";

const base = {
  firmId: "9e39add8-d585-46cb-ac80-f38b67e6397f",
  companyId: "cc46c97b-1772-4d70-93cf-58b71eb64fef",
  title: "Provide October bank statements",
  description: "Statements for the monthly reconciliation",
  status: "open",
  priority: "normal",
  due_date: "2026-11-12",
  assigned_to: null,
  last_note: "",
};

describe("firm client request validation", () => {
  it("accepts a scoped new request", () => {
    expect(requestInput.safeParse(base).success).toBe(true);
  });
  it("requires a version for editing and prohibits new record versions", () => {
    const id = "15bc8abc-dd70-4a73-8324-b05200386a69";
    expect(requestInput.safeParse({ ...base, id }).success).toBe(false);
    expect(requestInput.safeParse({ ...base, version: 1 }).success).toBe(false);
    expect(requestInput.safeParse({ ...base, id, version: 1 }).success).toBe(true);
  });
  it("rejects malformed dates, extra fields and invalid status", () => {
    expect(requestInput.safeParse({ ...base, due_date: "2026-02-30" }).success).toBe(false);
    expect(requestInput.safeParse({ ...base, description: "a".repeat(3001) }).success).toBe(false);
    expect(requestInput.safeParse({ ...base, status: "sent" }).success).toBe(false);
    expect(requestInput.safeParse({ ...base, company_id: base.companyId }).success).toBe(false);
  });
  it("counts only outstanding due dates as overdue", () => {
    const rows = [
      { status: "open" as const, due_date: "2026-11-01" },
      { status: "waiting" as const, due_date: "2026-11-04" },
      { status: "received" as const, due_date: "2026-11-01" },
      { status: "reviewed" as const, due_date: "2026-11-01" },
    ];
    expect(summarizeRequests(rows, "2026-11-04")).toEqual({
      total: 4,
      unresolved: 2,
      received: 1,
      overdue: 1,
    });
    expect(REQUEST_STATUSES).toHaveLength(5);
  });
});
