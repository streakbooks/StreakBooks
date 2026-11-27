import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { allocateDocumentNumber } from "./document-numbering";

describe("allocateDocumentNumber", () => {
  it("uses the company-scoped allocator and returns the generated number", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "INV-0042", error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(allocateDocumentNumber(client, "company-id", "sales_invoice")).resolves.toBe(
      "INV-0042",
    );
    expect(rpc).toHaveBeenCalledWith("allocate_document_number", {
      _company_id: "company-id",
      _document_type: "sales_invoice",
    });
  });

  it("surfaces database errors and rejects an empty allocation", async () => {
    const failed = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "Denied" } }) };
    await expect(
      allocateDocumentNumber(
        failed as unknown as SupabaseClient<Database>,
        "company-id",
        "sales_invoice",
      ),
    ).rejects.toThrow("Denied");

    const empty = { rpc: vi.fn().mockResolvedValue({ data: "  ", error: null }) };
    await expect(
      allocateDocumentNumber(
        empty as unknown as SupabaseClient<Database>,
        "company-id",
        "sales_invoice",
      ),
    ).rejects.toThrow("Could not allocate document number");
  });
});
