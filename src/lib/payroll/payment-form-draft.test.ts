import { describe, expect, it } from "vitest";
import { parsePayrollPaymentEntry } from "./payment-form-draft";

const slips = [
  { payslipId: "a", currency: "GBP", netMinor: 100_00, paidMinor: 25_00 },
  { payslipId: "b", currency: "GBP", netMinor: 80_00, paidMinor: 0 },
];

describe("parsePayrollPaymentEntry", () => {
  it("returns exact minor-unit amounts for a partial allocation", () => {
    expect(
      parsePayrollPaymentEntry({
        amount: "100.00",
        currency: "GBP",
        allocations: { a: "40.00", b: "30.00", ignored: "" },
        payslips: slips,
      }),
    ).toEqual({
      amountMinor: 10000,
      allocations: [
        { payslipId: "a", amountMinor: 4000 },
        { payslipId: "b", amountMinor: 3000 },
      ],
      unallocatedMinor: 3000,
    });
  });

  it("does not silently drop invalid allocation input", () => {
    expect(() =>
      parsePayrollPaymentEntry({
        amount: "100.00",
        currency: "GBP",
        allocations: { a: "invalid" },
        payslips: slips,
      }),
    ).toThrow(/allocation.*invalid/i);
  });

  it("rejects zero, negative and excessive allocation values", () => {
    for (const value of ["0", "-10.00", "100000000000000"]) {
      expect(() =>
        parsePayrollPaymentEntry({
          amount: "100.00",
          currency: "GBP",
          allocations: { a: value },
          payslips: slips,
        }),
      ).toThrow();
    }
  });

  it("rejects stale, closed or foreign-currency payslip allocations", () => {
    expect(() =>
      parsePayrollPaymentEntry({
        amount: "100.00",
        currency: "GBP",
        allocations: { old: "50.00" },
        payslips: slips,
      }),
    ).toThrow(/missing or closed/);

    expect(() =>
      parsePayrollPaymentEntry({
        amount: "100.00",
        currency: "GBP",
        allocations: { a: "50.00" },
        payslips: [{ ...slips[0]!, currency: "EUR" }],
      }),
    ).toThrow(/currency differs/);
  });

  it("rejects payments outside safe integer and invalid amount", () => {
    for (const value of ["0", "invalid", "100000000000000.00"]) {
      expect(() =>
        parsePayrollPaymentEntry({
          amount: value,
          currency: "GBP",
          allocations: {},
          payslips: slips,
        }),
      ).toThrow();
    }
  });

  it("validates outstanding balance and total allocation", () => {
    expect(() =>
      parsePayrollPaymentEntry({
        amount: "100.00",
        currency: "GBP",
        allocations: { a: "80.00" },
        payslips: slips,
      }),
    ).toThrow(/outstanding/);

    expect(() =>
      parsePayrollPaymentEntry({
        amount: "10.00",
        currency: "GBP",
        allocations: { a: "20.00" },
        payslips: slips,
      }),
    ).toThrow(/allocations exceed the payment/i);
  });

  it("permits a positive unallocated payment when allocation map is empty", () => {
    expect(parsePayrollPaymentEntry({
      amount: "45.50",
      currency: "GBP",
      allocations: {},
      payslips: slips,
    })).toEqual({ amountMinor: 4550, allocations: [], unallocatedMinor: 4550 });
  });
});
