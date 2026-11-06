import { describe, expect, it } from "vitest";
import { mustValidateFreshPayrollAllocations } from "./payment-replay-preflight";
import { validatePayrollPaymentAllocations } from "./payroll-payment-allocation";

describe("Payroll payment retry preflight", () => {
  it("runs outstanding-balance validation for a new key", () => {
    expect(mustValidateFreshPayrollAllocations(null)).toBe(true);
    expect(mustValidateFreshPayrollAllocations(undefined)).toBe(true);
    expect(mustValidateFreshPayrollAllocations("")).toBe(true);
  });

  it("leaves exact and changed replays to the authoritative database RPC", () => {
    expect(mustValidateFreshPayrollAllocations("11111111-1111-1111-1111-111111111111"))
      .toBe(false);
  });

  it("reproduces the otherwise incorrect retry rejection after full settlement", () => {
    const allocation = [{ payslipId: "payslip-1", amountMinor: 100n }];
    const original = validatePayrollPaymentAllocations(
      100n, allocation,
      [{ payslipId: "payslip-1", netMinor: 100n, paidMinor: 0n }],
    );
    const afterPosting = validatePayrollPaymentAllocations(
      100n, allocation,
      [{ payslipId: "payslip-1", netMinor: 100n, paidMinor: 100n }],
    );
    expect(original.ok).toBe(true);
    expect(afterPosting.ok).toBe(false);
    expect(mustValidateFreshPayrollAllocations("existing-payment-id")).toBe(false);
  });
});
