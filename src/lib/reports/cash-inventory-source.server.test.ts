import { describe, expect, it } from "vitest";
import { loadCashInventoryEvidenceRows } from "./cash-inventory-source.server";
function database(code?: string) {
  const calls: Array<{ columns: string; company: string }> = [];
  return {
    calls,
    db: {
      from() {
        const call = { columns: "", company: "" };
        calls.push(call);
        const q = {
          select(columns: string) {
            call.columns = columns;
            return q;
          },
          eq(_key: string, value: string) {
            call.company = value;
            return q;
          },
          order() {
            return q;
          },
          async range(from: number) {
            if (from > 0) return { data: [], error: null };
            return code && call.columns.includes("opening_paid_minor")
              ? {
                  data: null,
                  error: {
                    code,
                    message: "column cash_inventory_evidence.opening_paid_minor does not exist",
                  },
                }
              : {
                  data: [
                    {
                      id: "evidence",
                      cost_minor: "9007199254740993",
                      ...(call.columns.includes("opening_paid_minor")
                        ? { opening_paid_minor: "9007199254740993" }
                        : {}),
                    },
                  ],
                  error: null,
                };
          },
        };
        return q;
      },
    } as never,
  };
}
describe("cash acquisition schema compatibility", () => {
  it("keeps existing bill reporting available before the extension migration", async () => {
    const { db, calls } = database("42703");
    const result = await loadCashInventoryEvidenceRows(db, "company");
    expect(result.acquisitionsSupported).toBe(false);
    expect(result.rows[0]!["cost_minor"]).toBe("9007199254740993");
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.company === "company")).toBe(true);
    expect(calls[1]!.columns).not.toContain("opening_paid_minor");
  });
  it("retains exact historical paid amounts after the migration", async () => {
    const { db, calls } = database();
    const result = await loadCashInventoryEvidenceRows(db, "company");
    expect(result.acquisitionsSupported).toBe(true);
    expect(result.rows[0]!["opening_paid_minor"]).toBe("9007199254740993");
    expect(calls).toHaveLength(2);
  });
  it.each(["42501", "42P01", "XX000"])(
    "does not hide access or unexpected database errors (%s)",
    async (code) => {
      const { db, calls } = database(code);
      await expect(loadCashInventoryEvidenceRows(db, "company")).rejects.toThrow(
        "opening_paid_minor",
      );
      expect(calls).toHaveLength(1);
    },
  );
});
