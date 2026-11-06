import { describe, expect, it } from "vitest";
import {
  exactLedgerRpcAmount,
  selectExactLedgerBalances,
  loadExactReconciliationLedgerBalances,
} from "./reconciliation-ledger";
import type { Sb } from "@/lib/accounting/ledger-data";

describe("exact GL reconciliation balances", () => {
  it("accepts exact decimal strings even beyond JavaScript safe integer range", () => {
    expect(exactLedgerRpcAmount("9007199254740993", "Total")).toBe(9007199254740993n);
    expect(exactLedgerRpcAmount(0, "Total")).toBe(0n);
    expect(() => exactLedgerRpcAmount(Number.MAX_SAFE_INTEGER + 1, "Total")).toThrow(
      /safe integer/i,
    );
    expect(() => exactLedgerRpcAmount("12.5", "Total")).toThrow(/exact whole/i);
    expect(() => exactLedgerRpcAmount(null, "Total")).toThrow(/exact whole/i);
  });

  it("reads only authorised account ids, preserves negative net, and rejects duplicates", () => {
    const rows = [
      { account_id: "a", debit_minor: "10", credit_minor: "25" },
      { account_id: "outside", debit_minor: "999", credit_minor: "0" },
    ];
    expect(selectExactLedgerBalances(rows, new Set(["a"]))).toEqual([
      { account_id: "a", debit_minor: "10", credit_minor: "25" },
    ]);
    expect(() => selectExactLedgerBalances([...rows, rows[0]], new Set(["a"]))).toThrow(
      /duplicate/i,
    );
  });

  it("does not silently accept an unsafe or negative aggregate", () => {
    expect(() =>
      selectExactLedgerBalances(
        [{ account_id: "a", debit_minor: Number.MAX_SAFE_INTEGER + 2, credit_minor: 0 }],
        new Set(["a"]),
      ),
    ).toThrow(/safe integer/i);
    expect(() =>
      selectExactLedgerBalances(
        [{ account_id: "a", debit_minor: -1, credit_minor: 0 }],
        new Set(["a"]),
      ),
    ).toThrow(/cannot be negative/i);
    expect(() => selectExactLedgerBalances({ rows: [] }, new Set(["a"]))).toThrow(/invalid/i);
  });

  it("passes tenant and cutoff to canonical posted aggregate and does not fetch unrelated accounts", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const sb = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return {
          data: [
            { account_id: "a", debit_minor: "9007199254740993", credit_minor: "500" },
            { account_id: "outside", debit_minor: "100", credit_minor: "0" },
          ],
          error: null,
        };
      },
    } as unknown as Sb;
    const out = await loadExactReconciliationLedgerBalances(
      sb,
      "company-one",
      "USD",
      "2026-11-06",
      ["a"],
    );
    expect(out).toEqual([
      { account_id: "a", debit_minor: "9007199254740993", credit_minor: "500" },
    ]);
    expect(calls).toEqual([
      {
        fn: "ledger_balances",
        args: {
          _company_id: "company-one",
          _from: null,
          _to: "2026-11-06",
          _exclude_year_end_close: false,
        },
      },
    ]);
  });

  it("does not issue RPC for empty register account scopes", async () => {
    const sb = {
      rpc: () => {
        throw new Error("Should not be invoked");
      },
    } as unknown as Sb;
    expect(await loadExactReconciliationLedgerBalances(sb, "org", "USD", "2026-11-06", [])).toEqual([]);
  });

  it("fails closed when a successful RPC unexpectedly returns no balance dataset", async () => {
    const sb = {
      rpc: async () => ({ data: null, error: null }),
    } as unknown as Sb;
    await expect(
      loadExactReconciliationLedgerBalances(sb, "org", "USD", "2026-11-06", ["a"]),
    ).rejects.toThrow(/invalid posted-ledger/i);
  });

  it("falls back to tenant-scoped posted journal lines if the aggregate RPC is unavailable", async () => {
    const calls: Array<[string, unknown, unknown]> = [];
    const query = {
      select() {
        return this;
      },
      eq(field: string, value: unknown) {
        calls.push(["eq", field, value]);
        return this;
      },
      lte(field: string, value: unknown) {
        calls.push(["lte", field, value]);
        return this;
      },
      in(field: string, value: unknown) {
        calls.push(["in", field, value]);
        return this;
      },
      order(field: string) {
        calls.push(["order", field, null]);
        return this;
      },
      async range() {
        return { data: [], error: null };
      },
    };
    const sb = {
      rpc: async () => ({
        data: null,
        error: { code: "PGRST202", message: "Missing ledger_balances function" },
      }),
      from: (relation: string) => {
        expect(relation).toBe("journal_lines");
        return query;
      },
    } as unknown as Sb;
    expect(
      await loadExactReconciliationLedgerBalances(sb, "organisation-1", "USD", "2026-11-06", [
        "a",
      ]),
    ).toEqual([]);
    expect(calls).toContainEqual(["eq", "company_id", "organisation-1"]);
    expect(calls).toContainEqual(["eq", "journals.status", "posted"]);
    expect(calls).toContainEqual(["lte", "journals.journal_date", "2026-11-06"]);
    expect(calls).toContainEqual(["in", "account_id", ["a"]]);
  });

  it("propagates real SQL errors instead of reporting a false match", async () => {
    const sb = {
      rpc: async () => ({
        data: null,
        error: { code: "42501", message: "Not allowed" },
      }),
    } as unknown as Sb;
    await expect(
      loadExactReconciliationLedgerBalances(sb, "org", "USD", "2026-11-06", ["a"]),
    ).rejects.toThrow("Not allowed");
  });
});
