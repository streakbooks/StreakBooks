import { beforeEach, describe, expect, it, vi } from "vitest";
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
  assertCompanyMember: vi.fn(),
}));
vi.mock("@/lib/sales/posting", () => ({ postBankTransfer: vi.fn(), voidPostedDocument: vi.fn() }));
vi.mock("@/lib/banking/coding-server", () => ({ codeBankTransactionOnce: vi.fn() }));
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { suggestBankCoding } from "./banking.functions";

const calls: Array<[string, string, ...unknown[]]> = [];
let failingTable = "";
let memoryMissing = false;
const companyId = "00000000-0000-4000-8000-000000000001";
const context = {
  userId: "user",
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, "rpc", args]);
      return {
        data: [],
        error:
          failingTable === "memory"
            ? { message: "Unavailable evidence" }
            : memoryMissing
              ? { code: "PGRST202", message: "RPC not installed" }
              : null,
      };
    },
    from(table: string) {
      calls.push([table, "from"]);
      const q = Object.fromEntries(
        ["select", "eq", "is", "order", "limit", "maybeSingle"].map((op) => [
          op,
          (...args: unknown[]) => {
            calls.push([table, op, ...args]);
            return q;
          },
        ]),
      ) as Record<string, unknown>;
      q["then"] = (resolve: (value: unknown) => void) =>
        resolve({
          data:
            table === "bank_transactions"
              ? {
                  bank_account_id: "bank",
                  reference: "ref",
                  payee: null,
                  description: "supplier",
                  amount_minor: -100,
                  status: "uncategorised",
                }
              : [],
          error: table === failingTable ? { message: "Unavailable evidence" } : null,
        });
      return q;
    },
  },
};
const invoke = () =>
  (suggestBankCoding as unknown as (input: unknown) => Promise<unknown>)({
    data: { companyId, bankTransactionId: "txn" },
    context,
  });
beforeEach(() => {
  calls.length = 0;
  failingTable = "";
  memoryMissing = false;
  vi.mocked(assertCompanyPermission).mockReset();
});
describe("suggestion evidence boundary (mocked server handler)", () => {
  it("requires banking read permission before loading any evidence", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Permission revoked"));
    await expect(invoke()).rejects.toThrow("Permission revoked");
    expect(calls).toEqual([]);
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      context.supabase,
      companyId,
      "banking.view",
    );
  });
  it.each(["bank_transactions", "memory", "bank_rules"])(
    "fails visibly when %s cannot load",
    async (table) => {
      failingTable = table;
      await expect(invoke()).rejects.toThrow("Unavailable evidence");
    },
  );
  it("scopes all sources and eligible accounts to the requested company", async () => {
    await expect(invoke()).resolves.toMatchObject({ suggestions: [] });
    for (const table of ["bank_transactions", "bank_rules"]) {
      expect(calls).toContainEqual([table, "eq", "company_id", companyId]);
    }
    expect(calls).toContainEqual([
      "get_bank_coding_memory",
      "rpc",
      { _company_id: companyId, _bank_transaction_id: "txn" },
    ]);
    expect(calls.some(([table]) => table === "bank_coding_history")).toBe(false);
    for (const table of ["bank_rules"]) {
      expect(calls).toContainEqual([table, "eq", "accounts.company_id", companyId]);
      expect(calls).toContainEqual([table, "eq", "accounts.is_active", true]);
      expect(calls).toContainEqual([table, "eq", "accounts.is_postable", true]);
      expect(calls).toContainEqual([table, "eq", "accounts.is_control", false]);
      expect(calls).toContainEqual([table, "is", "accounts.archived_at", null]);
    }
  });
  it("exposes a missing migration without falling back to unverified legacy history", async () => {
    memoryMissing = true;
    await expect(invoke()).resolves.toMatchObject({
      memoryAvailable: false,
      memoryPreferences: [],
      suggestions: [],
    });
    expect(calls.some(([table]) => table === "bank_coding_history")).toBe(false);
  });
});
