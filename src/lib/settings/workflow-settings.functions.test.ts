import { describe, expect, it, vi } from "vitest";

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

import { upsertWorkflowSettings } from "./workflow-settings.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";

describe("upsertWorkflowSettings", () => {
  it("updates only the submitted settings and does not overwrite other modules", async () => {
    const update = vi.fn();
    const query = {
      update: (payload: Record<string, unknown>) => {
        update(payload);
        return query;
      },
      eq: () => query,
      select: () => query,
      maybeSingle: async () => ({
        data: { company_id: "10000000-0000-4000-8000-000000000001" },
        error: null,
      }),
    };
    const supabase = { from: vi.fn(() => query) };
    const invoke = upsertWorkflowSettings as unknown as (args: {
      data: { companyId: string; accountingRequireJournalMemo: boolean };
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<{ ok: boolean }>;

    const result = await invoke({
      data: {
        companyId: "10000000-0000-4000-8000-000000000001",
        accountingRequireJournalMemo: true,
      },
      context: { supabase, userId: "20000000-0000-4000-8000-000000000002" },
    });

    expect(result).toEqual({ ok: true });
    expect(supabase.from).toHaveBeenCalledWith("company_workflow_settings");
    expect(update).toHaveBeenCalledTimes(1);
    const updatePayload = update.mock.calls[0]?.[0];
    if (!updatePayload) throw new Error("Expected the settings row to be updated.");
    expect(Object.keys(updatePayload).sort()).toEqual([
      "accounting_require_journal_memo",
      "updated_at",
      "updated_by",
    ]);
    expect(updatePayload).toMatchObject({
      accounting_require_journal_memo: true,
      updated_by: "20000000-0000-4000-8000-000000000002",
    });
  });

  it("permission-checks and persists the submitted sales payment term", async () => {
    const update = vi.fn();
    const query = {
      update: (payload: Record<string, unknown>) => {
        update(payload);
        return query;
      },
      eq: () => query,
      select: () => query,
      maybeSingle: async () => ({
        data: { company_id: "10000000-0000-4000-8000-000000000001" },
        error: null,
      }),
    };
    const supabase = { from: vi.fn(() => query) };
    const companyId = "10000000-0000-4000-8000-000000000001";
    const invoke = upsertWorkflowSettings as unknown as (args: {
      data: { companyId: string; salesDefaultPaymentTermsDays: number };
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<{ ok: boolean }>;

    await expect(
      invoke({
        data: { companyId, salesDefaultPaymentTermsDays: 45 },
        context: { supabase, userId: "20000000-0000-4000-8000-000000000002" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(assertCompanyPermission).toHaveBeenCalledWith(
      supabase,
      companyId,
      "company.settings.edit",
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        sales_default_payment_terms_days: 45,
        updated_by: "20000000-0000-4000-8000-000000000002",
      }),
    );
  });

  it("permission-checks and persists the submitted quote validity", async () => {
    const update = vi.fn();
    const query = {
      update: (payload: Record<string, unknown>) => {
        update(payload);
        return query;
      },
      eq: () => query,
      select: () => query,
      maybeSingle: async () => ({
        data: { company_id: "10000000-0000-4000-8000-000000000001" },
        error: null,
      }),
    };
    const supabase = { from: vi.fn(() => query) };
    const companyId = "10000000-0000-4000-8000-000000000001";
    const invoke = upsertWorkflowSettings as unknown as (args: {
      data: { companyId: string; salesQuoteValidityDays: number };
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<{ ok: boolean }>;

    await expect(
      invoke({
        data: { companyId, salesQuoteValidityDays: 60 },
        context: { supabase, userId: "20000000-0000-4000-8000-000000000002" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(assertCompanyPermission).toHaveBeenCalledWith(
      supabase,
      companyId,
      "company.settings.edit",
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        sales_quote_validity_days: 60,
        updated_by: "20000000-0000-4000-8000-000000000002",
      }),
    );
  });

  it("permission-checks and persists the submitted purchase payment term", async () => {
    const update = vi.fn();
    const query = {
      update: (payload: Record<string, unknown>) => {
        update(payload);
        return query;
      },
      eq: () => query,
      select: () => query,
      maybeSingle: async () => ({
        data: { company_id: "10000000-0000-4000-8000-000000000001" },
        error: null,
      }),
    };
    const supabase = { from: vi.fn(() => query) };
    const companyId = "10000000-0000-4000-8000-000000000001";
    const invoke = upsertWorkflowSettings as unknown as (args: {
      data: { companyId: string; purchasesDefaultPaymentTermsDays: number };
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<{ ok: boolean }>;

    await expect(
      invoke({
        data: { companyId, purchasesDefaultPaymentTermsDays: 60 },
        context: { supabase, userId: "20000000-0000-4000-8000-000000000002" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(assertCompanyPermission).toHaveBeenCalledWith(
      supabase,
      companyId,
      "company.settings.edit",
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        purchases_default_payment_terms_days: 60,
        updated_by: "20000000-0000-4000-8000-000000000002",
      }),
    );
  });

  it("permission-checks and persists the purchase-order preference", async () => {
    const update = vi.fn();
    const query = {
      update: (payload: Record<string, unknown>) => {
        update(payload);
        return query;
      },
      eq: () => query,
      select: () => query,
      maybeSingle: async () => ({
        data: { company_id: "10000000-0000-4000-8000-000000000001" },
        error: null,
      }),
    };
    const supabase = { from: vi.fn(() => query) };
    const companyId = "10000000-0000-4000-8000-000000000001";
    const invoke = upsertWorkflowSettings as unknown as (args: {
      data: { companyId: string; purchasesRequirePo: boolean };
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<{ ok: boolean }>;

    await expect(
      invoke({
        data: { companyId, purchasesRequirePo: true },
        context: { supabase, userId: "20000000-0000-4000-8000-000000000002" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(assertCompanyPermission).toHaveBeenCalledWith(
      supabase,
      companyId,
      "company.settings.edit",
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        purchases_require_po: true,
        updated_by: "20000000-0000-4000-8000-000000000002",
      }),
    );
  });

  it("permission-checks and persists only the submitted Sales and Purchase notes", async () => {
    const update = vi.fn();
    const query = {
      update: (payload: Record<string, unknown>) => {
        update(payload);
        return query;
      },
      eq: () => query,
      select: () => query,
      maybeSingle: async () => ({
        data: { company_id: "10000000-0000-4000-8000-000000000001" },
        error: null,
      }),
    };
    const supabase = { from: vi.fn(() => query) };
    const companyId = "10000000-0000-4000-8000-000000000001";
    const invoke = upsertWorkflowSettings as unknown as (args: {
      data: { companyId: string; salesDefaultNotes: string; purchasesDefaultNotes: string };
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<{ ok: boolean }>;

    await expect(
      invoke({
        data: {
          companyId,
          salesDefaultNotes: "Sales note",
          purchasesDefaultNotes: "Purchase note",
        },
        context: { supabase, userId: "20000000-0000-4000-8000-000000000002" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(assertCompanyPermission).toHaveBeenCalledWith(
      supabase,
      companyId,
      "company.settings.edit",
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        sales_default_notes: "Sales note",
        purchases_default_notes: "Purchase note",
        updated_by: "20000000-0000-4000-8000-000000000002",
      }),
    );
  });
});
