import { describe, it, expect } from "vitest";
import { automationActionSchema, parseAutomationSearch, ruleSchema } from "./automation";
const id = "80000000-0000-4000-8000-000000000001";
const rule = {
  id: null,
  row_version: null,
  name: "Overdue support",
  metric: "overdue_cases",
  severity: "warning",
  threshold: 0,
  quiet_start_utc: null,
  quiet_end_utc: null,
};
describe("operational automation boundaries", () => {
  it("does not turn arbitrary job text or URLs into executable work", () => {
    expect(() =>
      automationActionSchema.parse({
        command: "jobs.enqueue",
        payload: { kind: "SELECT * FROM journals" },
        reason: "Reviewed run",
        requestId: id,
      }),
    ).toThrow();
    expect(() =>
      automationActionSchema.parse({
        command: "jobs.enqueue",
        payload: { kind: "check_operations", url: "https://example.invalid" },
        reason: "Reviewed run",
        requestId: id,
      }),
    ).toThrow();
  });
  it("requires consistent quiet hours, safe counts and a revision on existing rules", () => {
    expect(ruleSchema.parse(rule)).toEqual(rule);
    expect(() => ruleSchema.parse({ ...rule, quiet_start_utc: 23 })).toThrow();
    expect(() => ruleSchema.parse({ ...rule, quiet_start_utc: 23, quiet_end_utc: 23 })).toThrow();
    expect(ruleSchema.parse({ ...rule, quiet_start_utc: 23, quiet_end_utc: 6 }).quiet_end_utc).toBe(
      6,
    );
    expect(() => ruleSchema.parse({ ...rule, threshold: 0.1 })).toThrow();
    expect(() => ruleSchema.parse({ ...rule, threshold: 2147483648 })).toThrow();
    expect(() => ruleSchema.parse({ ...rule, id })).toThrow();
  });
  it("clears invalid raw route state and blocks inherited command keys", () => {
    expect(parseAutomationSearch({ module: "bad", item: "bad" })).toEqual({
      module: "jobs",
      item: undefined,
    });
    expect(() =>
      automationActionSchema.parse({
        command: "constructor",
        payload: {},
        reason: "Rejected action",
        requestId: id,
      }),
    ).toThrow();
  });
});
