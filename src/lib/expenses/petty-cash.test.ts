import { describe, expect, it } from "vitest";
import {
  buildPettyCashFundLines,
  canFundPettyCashFloat,
  mapExpensePettyCashFloat,
  replenishAmountMinor,
} from "./petty-cash";

describe("replenishAmountMinor", () => {
  it("returns the gap to target", () => {
    expect(replenishAmountMinor({ targetMinor: 10000, balanceMinor: 3500 })).toBe(6500);
    expect(replenishAmountMinor({ targetMinor: 10000, balanceMinor: 10000 })).toBe(0);
  });
});

describe("canFundPettyCashFloat", () => {
  it("allows active floats with positive amount", () => {
    expect(canFundPettyCashFloat({ status: "active", amountMinor: 100 })).toEqual({
      ok: true,
    });
  });

  it("blocks closed floats or zero amounts", () => {
    expect(canFundPettyCashFloat({ status: "closed", amountMinor: 100 }).ok).toBe(false);
    expect(canFundPettyCashFloat({ status: "active", amountMinor: 0 }).ok).toBe(false);
  });
});

describe("buildPettyCashFundLines", () => {
  it("builds DR petty cash / CR bank", () => {
    const result = buildPettyCashFundLines({
      pettyCashAccountId: "pc",
      bankAccountId: "bank",
      amountMinor: 5000,
      floatNumber: "PC-0001",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines[0]?.debitMinor).toBe(5000);
    expect(result.lines[1]?.creditMinor).toBe(5000);
  });
});

describe("mapExpensePettyCashFloat", () => {
  it("maps snake_case RPC rows", () => {
    const row = mapExpensePettyCashFloat({
      id: "f1",
      float_number: "PC-0003",
      name: "Front desk",
      description: null,
      custodian_user_id: "u1",
      currency_code: "gbp",
      target_minor: 20000,
      balance_minor: 8000,
      status: "active",
      version: 3,
      updated_at: "2026-11-07T00:00:00Z",
    });
    expect(row.currencyCode).toBe("GBP");
    expect(row.floatNumber).toBe("PC-0003");
    expect(row.balanceMinor).toBe(8000);
  });
});
