import { describe, expect, it } from "vitest";
import { isBasicPayrollConfigComplete } from "./payroll-feature-config";

describe("isBasicPayrollConfigComplete", () => {
  const complete = {
    enabled: true,
    disclaimerAcknowledged: true,
    salaryExpenseAccountId: "exp-1",
    netPayLiabilityAccountId: "net-1",
    deductionLiabilityAccountId: "ded-1",
    activeScheduleCount: 1,
  };

  it("requires enablement, disclaimer, GL trio and an active schedule", () => {
    expect(isBasicPayrollConfigComplete(complete)).toBe(true);
    expect(isBasicPayrollConfigComplete({ ...complete, enabled: false })).toBe(false);
    expect(isBasicPayrollConfigComplete({ ...complete, disclaimerAcknowledged: false })).toBe(
      false,
    );
    expect(isBasicPayrollConfigComplete({ ...complete, salaryExpenseAccountId: null })).toBe(false);
    expect(isBasicPayrollConfigComplete({ ...complete, activeScheduleCount: 0 })).toBe(false);
  });
});
