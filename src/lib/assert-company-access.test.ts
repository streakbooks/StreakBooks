import { describe, expect, it, vi } from "vitest";
import {
  assertCompanyMember,
  assertCompanyPermission,
  assertCompanyPermissionAny,
} from "@/lib/assert-company-access";

const companyId = "11111111-1111-4111-8111-111111111111";

function mockClient(rpcResult: { data: unknown; error: { message: string } | null }) {
  const client = { rpc: vi.fn().mockResolvedValue(rpcResult) };
  return client as typeof client & Parameters<typeof assertCompanyPermission>[0];
}

describe("assertCompanyPermission", () => {
  it("resolves when the RPC grants the permission", async () => {
    const supabase = mockClient({ data: true, error: null });
    await expect(
      assertCompanyPermission(supabase, companyId, "sales.view"),
    ).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith("has_company_permission", {
      _company_id: companyId,
      _permission: "sales.view",
    });
  });

  it("denies with a clear organisation-scoped message when the RPC returns false", async () => {
    const supabase = mockClient({ data: false, error: null });
    await expect(assertCompanyPermission(supabase, companyId, "sales.authorise")).rejects.toThrow(
      "You do not have permission to perform this action for this organisation.",
    );
  });

  it("surfaces RPC failures instead of treating them as grants", async () => {
    const supabase = mockClient({ data: null, error: { message: "rpc unavailable" } });
    await expect(assertCompanyPermission(supabase, companyId, "sales.view")).rejects.toThrow(
      "rpc unavailable",
    );
  });
});

describe("assertCompanyPermissionAny", () => {
  it("accepts an alternative permission and records the access once", async () => {
    const client = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: false, error: null })
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
    };
    const supabase = client as typeof client & Parameters<typeof assertCompanyPermission>[0];

    await expect(
      assertCompanyPermissionAny(supabase, companyId, [
        "expenses.manage_policies",
        "expenses.admin",
      ]),
    ).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, "has_company_permission", {
      _company_id: companyId,
      _permission: "expenses.admin",
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(3, "record_firm_client_access", {
      _company_id: companyId,
      _module_key: "expenses",
    });
  });

  it("fails closed when no permission grants access or a permission RPC fails", async () => {
    const denied = mockClient({ data: false, error: null });
    await expect(
      assertCompanyPermissionAny(denied, companyId, ["expenses.manage_policies", "expenses.admin"]),
    ).rejects.toThrow("You do not have permission");

    const failed = mockClient({ data: null, error: { message: "rpc unavailable" } });
    await expect(assertCompanyPermissionAny(failed, companyId, ["expenses.admin"])).rejects.toThrow(
      "rpc unavailable",
    );
  });
});

describe("assertCompanyMember", () => {
  it("resolves for members", async () => {
    const supabase = mockClient({ data: true, error: null });
    await expect(assertCompanyMember(supabase, companyId)).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith("is_company_member", {
      _company_id: companyId,
    });
  });

  it("denies non-members without implying permission to mutate", async () => {
    const supabase = mockClient({ data: false, error: null });
    await expect(assertCompanyMember(supabase, companyId)).rejects.toThrow(
      "You do not have access to that organisation.",
    );
  });

  it("surfaces membership RPC failures instead of empty success", async () => {
    const supabase = mockClient({
      data: null,
      error: { message: "membership check failed" },
    });
    await expect(assertCompanyMember(supabase, companyId)).rejects.toThrow(
      "membership check failed",
    );
  });
});
