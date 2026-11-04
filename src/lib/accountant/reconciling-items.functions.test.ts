import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    return {
      middleware() {
        return this;
      },
      inputValidator(fn: (input: unknown) => unknown) {
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
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));

import {
  listWorkpaperReconcilingItems,
  listWorkpaperItemEvents,
  saveWorkpaperReconcilingItem,
} from "./reconciling-items.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";

const companyId = "10000000-0000-4000-8000-000000000001";
const workpaperId = "20000000-0000-4000-8000-000000000001";
const itemId = "30000000-0000-4000-8000-000000000001";
const calls: Array<[string, ...unknown[]]> = [];

function fakeDb() {
  const builder = {
    select() {
      return this;
    },
    eq(key: string, value: unknown) {
      calls.push(["eq", key, value]);
      return this;
    },
    order() {
      return Promise.resolve({ data: [], error: null });
    },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
  };
  return {
    from(table: string) {
      calls.push(["from", table]);
      return builder;
    },
    rpc(name: string, args: unknown) {
      calls.push(["rpc", name, args]);
      return Promise.resolve({ data: { id: itemId, state: "open", version: 1 }, error: null });
    },
  };
}
type ServerFunction = (args: unknown) => Promise<unknown>;
const list = listWorkpaperReconcilingItems as unknown as ServerFunction;
const history = listWorkpaperItemEvents as unknown as ServerFunction;
const save = saveWorkpaperReconcilingItem as unknown as ServerFunction;

beforeEach(() => {
  calls.length = 0;
  vi.resetAllMocks();
});

describe("workpaper reconciling item server protections", () => {
  it("checks accounting.view and scopes every list query by company and workpaper", async () => {
    const client = fakeDb();
    await list({ data: { companyId, workpaperId }, context: { supabase: client } });
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "accounting.view");
    expect(calls).toEqual(
      expect.arrayContaining([
        ["from", "account_workpaper_reconciling_items"],
        ["eq", "company_id", companyId],
        ["eq", "workpaper_id", workpaperId],
      ]),
    );
  });

  it("denies unauthorized reads before querying the database", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("No permission"));
    await expect(
      list({ data: { companyId, workpaperId }, context: { supabase: fakeDb() } }),
    ).rejects.toThrow("No permission");
    expect(calls).toHaveLength(0);
  });

  it("rejects zero, unsafe and invalid monetary values before write", async () => {
    for (const amountMinor of ["0", "9007199254740992", "1.25", "-9007199254740992"]) {
      await expect(
        save({
          data: {
            companyId,
            workpaperId,
            payload: { action: "add", description: "Difference", amountMinor },
          },
          context: { supabase: fakeDb() },
        }),
      ).rejects.toThrow();
    }
    expect(calls).toHaveLength(0);
  });

  it("rejects mutation with missing saved-version and resolution explanation", async () => {
    await expect(
      save({
        data: {
          companyId,
          workpaperId,
          payload: { action: "resolve", id: itemId, reason: "Verified" },
        },
        context: { supabase: fakeDb() },
      }),
    ).rejects.toThrow();
    await expect(
      save({
        data: {
          companyId,
          workpaperId,
          payload: { action: "reopen", id: itemId, version: 2, reason: "x" },
        },
        context: { supabase: fakeDb() },
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("routes authorized draft changes only through the authoritative RPC", async () => {
    const client = fakeDb();
    await save({
      data: {
        companyId,
        workpaperId,
        payload: {
          action: "add",
          description: "Uncleared bank item",
          amountMinor: "-1250",
          evidenceReference: "STMT-2026-10",
        },
      },
      context: { supabase: client },
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(client, companyId, "accounting.post");
    expect(calls).toEqual([
      [
        "rpc",
        "save_account_workpaper_reconciling_item",
        expect.objectContaining({
          _company_id: companyId,
          _workpaper_id: workpaperId,
          _payload: expect.objectContaining({ amountMinor: "-1250" }),
        }),
      ],
    ]);
  });

  it("scopes immutable history to company, workpaper and item", async () => {
    await history({
      data: { companyId, workpaperId, itemId },
      context: { supabase: fakeDb() },
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        ["from", "account_workpaper_reconciling_item_events"],
        ["eq", "company_id", companyId],
        ["eq", "workpaper_id", workpaperId],
        ["eq", "item_id", itemId],
      ]),
    );
  });
});
