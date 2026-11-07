import { describe, expect, it, vi } from "vitest";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";

const companyId = "11111111-1111-4111-8111-111111111111";

function mockClient(rpcResult: { data: unknown; error: { message: string } | null }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as never;
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
    await expect(
      assertCompanyPermission(supabase, companyId, "sales.authorise"),
    ).rejects.toThrow(
      "You do not have permission to perform this action for this organisation.",
    );
  });

  it("surfaces RPC failures instead of treating them as grants", async () => {
    const supabase = mockClient({ data: null, error: { message: "rpc unavailable" } });
    await expect(
      assertCompanyPermission(supabase, companyId, "sales.view"),
    ).rejects.toThrow("rpc unavailable");
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

