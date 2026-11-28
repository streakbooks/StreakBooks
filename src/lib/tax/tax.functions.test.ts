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
      inputValidator(fn: (value: unknown) => unknown) {
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
vi.mock("@/lib/assert-company-access", () => ({
  assertCompanyMember: vi.fn(),
  assertCompanyPermission: vi.fn(),
}));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { updateTaxSettings } from "./tax.functions";

const companyId = "10000000-0000-4000-8000-000000000011";
const update = updateTaxSettings as unknown as (args: unknown) => Promise<unknown>;

function client(result: { data?: unknown; error?: { message: string } | null } = { data: {} }) {
  const query = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
  };
  const table = {
    update: vi.fn(() => query),
  };
  const supabase = {
    from: vi.fn(() => table),
  };
  return { supabase, table, query };
}

beforeEach(() => vi.clearAllMocks());

describe("updateTaxSettings compare-and-set", () => {
  it("checks permission and updates only patched fields matching their loaded snapshot", async () => {
    const { supabase, table, query } = client({ data: { company_id: companyId } });
    await update({
      data: {
        companyId,
        expected: { taxRegime: "none", registrationNumber: null },
        taxRegime: "vat",
        registrationNumber: "GB123",
      },
      context: { supabase },
    });

    expect(assertCompanyPermission).toHaveBeenCalledWith(supabase, companyId, "tax.settings");
    expect(table.update).toHaveBeenCalledWith(
      expect.objectContaining({ tax_regime: "vat", registration_number: "GB123" }),
    );
    expect(query.eq).toHaveBeenCalledWith("company_id", companyId);
    expect(query.eq).toHaveBeenCalledWith("tax_regime", "none");
    expect(query.is).toHaveBeenCalledWith("registration_number", null);
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("rejects stale snapshots instead of reporting a save that matched no row", async () => {
    const { supabase } = client({ data: null });
    await expect(
      update({
        data: {
          companyId,
          expected: { taxRegime: "none" },
          taxRegime: "gst",
        },
        context: { supabase },
      }),
    ).rejects.toThrow("Tax settings changed since loaded. Reload before saving.");
  });

  it("requires an expected value for every changed field before querying", async () => {
    const { supabase } = client();
    await expect(
      update({
        data: { companyId, expected: {}, registrationNumber: "GB123" },
        context: { supabase },
      }),
    ).rejects.toThrow("Reload the latest Tax settings before saving.");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("surfaces database failures", async () => {
    const { supabase } = client({ error: { message: "tax settings write failed" } });
    await expect(
      update({
        data: { companyId, expected: { taxRegime: "none" }, taxRegime: "vat" },
        context: { supabase },
      }),
    ).rejects.toThrow("tax settings write failed");
  });
});
