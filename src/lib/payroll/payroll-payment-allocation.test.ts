import { describe, expect, it } from "vitest";
import {
  derivePayslipPaymentStatus,
  payslipOutstanding,
  validatePayrollPaymentAllocations,
} from "@/lib/payroll/payroll-payment-allocation";

describe("payroll payment allocation helpers", () => {
  const payslips = [
    { payslipId: "a", netMinor: 100_000n, paidMinor: 0n },
    { payslipId: "b", netMinor: 50_000n, paidMinor: 25_000n },
  ];

  it("computes outstanding net pay", () => {
    expect(payslipOutstanding(payslips[0]!)).toBe(100_000n);
    expect(payslipOutstanding(payslips[1]!)).toBe(25_000n);
  });

  it("derives payslip payment status", () => {
    expect(derivePayslipPaymentStatus(100_000n, 0n)).toBe("unpaid");
    expect(derivePayslipPaymentStatus(100_000n, 40_000n)).toBe("partial");
    expect(derivePayslipPaymentStatus(100_000n, 100_000n)).toBe("paid");
  });

  it("accepts valid partial allocations across payslips", () => {
    const result = validatePayrollPaymentAllocations(
      60_000n,
      [
        { payslipId: "a", amountMinor: 40_000n },
        { payslipId: "b", amountMinor: 20_000n },
      ],
      payslips,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.allocTotal).toBe(60_000n);
      expect(result.unallocated).toBe(0n);
    }
  });

  it("rejects duplicate payslip ids", () => {
    const result = validatePayrollPaymentAllocations(
      10_000n,
      [
        { payslipId: "a", amountMinor: 5_000n },
        { payslipId: "a", amountMinor: 5_000n },
      ],
      payslips,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects allocation over outstanding", () => {
    const result = validatePayrollPaymentAllocations(
      200_000n,
      [{ payslipId: "b", amountMinor: 30_000n }],
      payslips,
    );
    expect(result.ok).toBe(false);
  });
});
