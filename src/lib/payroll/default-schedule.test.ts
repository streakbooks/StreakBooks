import { describe, expect, it } from "vitest";
import { defaultActivePayrollScheduleId } from "./default-schedule";

describe("default payroll schedule selection", () => {
  const schedules = [
    { id: "monthly", is_active: true },
    { id: "old-weekly", is_active: false },
  ];

  it("selects the configured schedule only while it remains active", () => {
    expect(defaultActivePayrollScheduleId("monthly", schedules)).toBe("monthly");
    expect(defaultActivePayrollScheduleId("old-weekly", schedules)).toBe("");
    expect(defaultActivePayrollScheduleId("missing", schedules)).toBe("");
    expect(defaultActivePayrollScheduleId(null, schedules)).toBe("");
  });
});
