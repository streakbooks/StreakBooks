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

import { ONBOARDING_TEMPLATE, engagementInput, planningInput } from "./firm-workflows.functions";

const valid = {
  firmId: "9e39add8-d585-46cb-ac80-f38b67e6397f",
  companyId: "cc46c97b-1772-4d70-93cf-58b71eb64fef",
  name: "Monthly bookkeeping",
  status: "draft",
  frequency: "monthly",
  start_date: "2026-11-01",
  end_date: null,
  agreed_fee: "250.00",
  currency_code: "AUD",
  notes: "",
};

describe("firm onboarding and engagement validation", () => {
  it("has unique and usable default checklist steps", () => {
    expect(ONBOARDING_TEMPLATE).toHaveLength(5);
    expect(new Set(ONBOARDING_TEMPLATE.map((step) => step.key)).size).toBe(5);
    expect(ONBOARDING_TEMPLATE.every((step) => step.title.length > 2)).toBe(true);
  });

  it("accepts valid engagement dates and agreed fee", () => {
    expect(engagementInput.safeParse(valid).success).toBe(true);
    expect(
      engagementInput.safeParse({ ...valid, agreed_fee: null, currency_code: "" }).success,
    ).toBe(true);
  });

  it("rejects incomplete fee and currency pairs", () => {
    expect(engagementInput.safeParse({ ...valid, currency_code: "" }).success).toBe(false);
    expect(engagementInput.safeParse({ ...valid, agreed_fee: null }).success).toBe(false);
    expect(engagementInput.safeParse({ ...valid, agreed_fee: "-10" }).success).toBe(false);
    expect(engagementInput.safeParse({ ...valid, agreed_fee: "12.345" }).success).toBe(false);
  });

  it("rejects invalid date ranges and forged update versions", () => {
    expect(engagementInput.safeParse({ ...valid, end_date: "2026-10-31" }).success).toBe(false);
    expect(engagementInput.safeParse({ ...valid, start_date: "2026-02-30" }).success).toBe(false);
    expect(
      engagementInput.safeParse({ ...valid, id: "e5bc8abc-dd70-4a73-8324-b05200386a69" }).success,
    ).toBe(false);
  });
});

describe("onboarding plan validation", () => {
  const plan = {
    firmId: valid.firmId,
    companyId: valid.companyId,
    task_key: "opening_records",
    version: 3,
    assignee_id: null,
    due_date: "2026-11-10",
    depends_on_task_key: "access",
    reminders_enabled: true,
  };
  it("accepts a valid assigned plan, cleared assignee and blank due date", () => {
    expect(planningInput.safeParse(plan).success).toBe(true);
    expect(planningInput.safeParse({
      ...plan,
      due_date: null,
      depends_on_task_key: null,
      assignee_id: valid.firmId,
    }).success).toBe(true);
  });
  it("rejects invalid dates, forged versions, self-dependency and unknown inputs", () => {
    expect(planningInput.safeParse({ ...plan, due_date: "2026-02-30" }).success).toBe(false);
    expect(planningInput.safeParse({ ...plan, version: 0 }).success).toBe(false);
    expect(planningInput.safeParse({
      ...plan, depends_on_task_key: "opening_records",
    }).success).toBe(false);
    expect(planningInput.safeParse({ ...plan, unexplained: true }).success).toBe(false);
  });
});
