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
vi.mock("@/lib/assert-company-access", () => ({
  assertCompanyMember: vi.fn(),
  assertCompanyPermission: vi.fn(),
}));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { updateCompany } from "./company.functions";

const companyId = "10000000-0000-4000-8000-000000000001";
const baseline = {
  name: "Northgate Consulting",
  legal_name: "Northgate Consulting Ltd",
  country_code: "GB",
  base_currency: "GBP",
  fiscal_year_end_month: 3,
  fiscal_year_end_day: 31,
  timezone: "Europe/London",
  tax_regime: "vat",
  registration_number: "GB123456789",
  prices_include_tax: false,
};

function client(
  result: { data?: unknown; error?: { message: string } | null } = { data: {}, error: null },
) {
  return {
    from: vi.fn(() => {
      throw new Error("Identity saves must use the atomic RPC, not table updates");
    }),
    rpc: vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null }),
  };
}

const update = updateCompany as unknown as (args: unknown) => Promise<unknown>;

beforeEach(() => vi.clearAllMocks());

describe("organisation identity Settings save", () => {
  it("sends the expected snapshot and desired company/tax values through the atomic RPC", async () => {
    const supabase = client({ data: { name: "Updated" } });
    await update({
      data: {
        ...baseline,
        expected: baseline,
        companyId,
        name: "Updated Northgate",
        base_currency: "INR",
        tax_regime: "gst",
        registration_number: "GSTIN123",
        prices_include_tax: true,
      },
      context: { supabase },
    });

    expect(assertCompanyPermission).toHaveBeenCalledWith(
      supabase,
      companyId,
      "company.settings.edit",
    );
    expect(assertCompanyPermission).toHaveBeenCalledWith(supabase, companyId, "tax.settings");
    expect(supabase.rpc).toHaveBeenCalledWith(
      "save_company_identity_and_tax",
      expect.objectContaining({
        _company_id: companyId,
        _expected: baseline,
        _desired: expect.objectContaining({
          name: "Updated Northgate",
          base_currency: "INR",
          tax_regime: "gst",
          registration_number: "GSTIN123",
          prices_include_tax: true,
        }),
      }),
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a missing loaded snapshot before making a database call", async () => {
    const supabase = client();
    await expect(
      update({ data: { ...baseline, companyId }, context: { supabase } }),
    ).rejects.toThrow("Reload organisation settings before saving.");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("does not require Tax permission when saving unchanged Tax values with company details", async () => {
    const supabase = client({ data: { name: "Updated" } });
    await update({
      data: {
        ...baseline,
        expected: baseline,
        companyId,
        name: "Updated Northgate",
      },
      context: { supabase },
    });

    expect(assertCompanyPermission).toHaveBeenCalledOnce();
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      supabase,
      companyId,
      "company.settings.edit",
    );
  });

  it("surfaces stale-snapshot RPC errors without retrying or writing separate tables", async () => {
    const supabase = client({ data: null, error: { message: "Reload the latest values" } });
    await expect(
      update({ data: { ...baseline, expected: baseline, companyId }, context: { supabase } }),
    ).rejects.toThrow("Reload the latest values");
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
