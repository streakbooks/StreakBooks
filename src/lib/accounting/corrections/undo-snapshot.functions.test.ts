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
vi.mock("@/lib/assert-company-access", () => ({
  assertCompanyPermission: vi.fn(),
}));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { getCorrectionUndoSnapshot } from "./correction.functions";

describe("scoped correction undo review endpoint", () => {
  const call = getCorrectionUndoSnapshot as unknown as (args: unknown) => Promise<unknown>;

  it("reads only the requested batch within the authorised organisation", async () => {
    const batch = {
      id: "batch-1",
      company_id: "company-1",
      status: "applied",
      request_key: "key-1",
      journal_ids: ["journal-1"],
    };
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: batch, error: null })),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    const supabase = { from: vi.fn(() => builder) };

    const result = await call({
      data: { companyId: "company-1", batchId: "batch-1" },
      context: { supabase },
    });
    expect(result).toEqual(batch);
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      supabase,
      "company-1",
      "accounting.view",
    );
    expect(builder.eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(builder.eq).toHaveBeenCalledWith("id", "batch-1");
  });

  it("refuses missing batches rather than allowing cross-organisation review", async () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    const supabase = { from: vi.fn(() => builder) };
    await expect(
      call({
        data: { companyId: "company-1", batchId: "different-company-batch" },
        context: { supabase },
      }),
    ).rejects.toThrow("not found");
  });
});
