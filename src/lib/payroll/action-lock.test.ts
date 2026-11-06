import { describe, expect, it } from "vitest";
import { acquirePayrollMutationLock, releasePayrollMutationLock } from "./action-lock";

describe("Payroll settlement action lock", () => {
  it("permits one submission immediately", () => {
    const lock = { current: false };
    expect(acquirePayrollMutationLock(lock)).toBe(true);
    expect(lock.current).toBe(true);
  });

  it("blocks a second click before pending state can rerender", () => {
    const lock = { current: false };
    expect(acquirePayrollMutationLock(lock)).toBe(true);
    expect(acquirePayrollMutationLock(lock)).toBe(false);
    expect(lock.current).toBe(true);
  });

  it("releases after success or failure so the user can retry", () => {
    const lock = { current: false };
    expect(acquirePayrollMutationLock(lock)).toBe(true);
    releasePayrollMutationLock(lock);
    expect(acquirePayrollMutationLock(lock)).toBe(true);
  });

  it("does not mix two independent Payroll action locks", () => {
    const payment = { current: false };
    const reversal = { current: false };
    expect(acquirePayrollMutationLock(payment)).toBe(true);
    expect(acquirePayrollMutationLock(reversal)).toBe(true);
    expect(acquirePayrollMutationLock(payment)).toBe(false);
  });
});
