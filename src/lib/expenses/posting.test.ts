import { describe, expect, it } from "vitest";
import { buildEmployeePaidAccrualLines } from "./posting";

describe("employee-paid claim accrual lines", () => {
  it("builds balanced DR expense + tax and CR payable", () => {
    const result = buildEmployeePaidAccrualLines({
      claimNumber: "EXP-0001",
      payableAccountId: "payable",
      inputTaxAccountId: "tax",
      headerTotalMinor: 1100,
      lines: [
        {
          accountId: "travel",
          description: "Taxi",
          netMinor: 1000,
          taxMinor: 100,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toEqual([
      { accountId: "travel", debitMinor: 1000, creditMinor: 0, description: "Taxi" },
      { accountId: "tax", debitMinor: 100, creditMinor: 0, description: "Input tax on EXP-0001" },
      {
        accountId: "payable",
        debitMinor: 0,
        creditMinor: 1100,
        description: "Employee payable EXP-0001",
      },
    ]);
  });

  it("rejects missing tax account when tax exists", () => {
    const result = buildEmployeePaidAccrualLines({
      claimNumber: "EXP-0001",
      payableAccountId: "payable",
      inputTaxAccountId: null,
      headerTotalMinor: 1100,
      lines: [{ accountId: "travel", description: "Taxi", netMinor: 1000, taxMinor: 100 }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects header mismatch", () => {
    const result = buildEmployeePaidAccrualLines({
      claimNumber: "EXP-0001",
      payableAccountId: "payable",
      inputTaxAccountId: null,
      headerTotalMinor: 999,
      lines: [{ accountId: "travel", description: "Taxi", netMinor: 1000, taxMinor: 0 }],
    });
    expect(result.ok).toBe(false);
  });
});
