import { describe, expect, it } from "vitest";
import {
  canTransition,
  isoDate,
  isOverdue,
  monthEnd,
  taskPayload,
  type PracticeTask,
} from "./practice-work";
const task: PracticeTask = {
  id: "00000000-0000-4000-8000-000000000001",
  company_id: "00000000-0000-4000-8000-000000000002",
  title: "Review cash",
  kind: "month_end",
  period_end: "2026-10-31",
  due_date: "2026-11-07",
  status: "todo",
  assignee_id: null,
  note: "",
  version: 1,
  prepared_by: null,
  reviewed_by: null,
  completed_at: null,
  updated_at: "2026-11-01T00:00:00Z",
};
describe("practice work controls", () => {
  it("requires real calendar dates", () => {
    for (const d of ["2026-02-29", "2026-13-01", "2026-11-31", "01/11/2026", ""])
      expect(isoDate.safeParse(d).success).toBe(false);
    expect(isoDate.parse("2028-02-29")).toBe("2028-02-29");
  });
  it("generates calendar month ends, including leap years and year boundaries", () => {
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
    expect(monthEnd("2026-04")).toBe("2026-04-30");
    for (const m of ["2026-13", "2026-00", "abc"]) expect(() => monthEnd(m)).toThrow();
  });
  it("requires creation fields and prevents fabricated reviewer evidence", () => {
    expect(
      taskPayload.safeParse({ title: "A", kind: "deadline", due_date: "2026-11-01" }).success,
    ).toBe(false);
    expect(
      taskPayload.safeParse({
        title: "Valid",
        kind: "deadline",
        due_date: "2026-11-01",
        reviewed_by: "attacker",
      }).success,
    ).toBe(false);
    expect(
      taskPayload.safeParse({
        title: "Valid",
        kind: "deadline",
        due_date: "2026-11-01",
        status: "completed",
      }).success,
    ).toBe(false);
  });
  it("requires a captured version for edits", () => {
    expect(taskPayload.safeParse({ id: task.id, note: "New note" }).success).toBe(false);
    expect(taskPayload.safeParse({ id: task.id, version: 1, note: "New note" }).success).toBe(true);
  });
  it("cannot skip preparation or independently complete your own work", () => {
    expect(canTransition(task, "completed", "u1")).toBe(false);
    expect(canTransition(task, "ready", "u1")).toBe(false);
    expect(canTransition({ ...task, status: "ready", prepared_by: "u1" }, "completed", "u1")).toBe(
      false,
    );
    expect(canTransition({ ...task, status: "ready", prepared_by: "u1" }, "completed", "u2")).toBe(
      true,
    );
    expect(canTransition({ ...task, status: "ready" }, "completed", "u2")).toBe(false);
  });
  it("requires reopen before changing completed work", () => {
    expect(canTransition({ ...task, status: "completed" }, "ready", "u2")).toBe(false);
    expect(canTransition({ ...task, status: "completed" }, "in_progress", "u2")).toBe(true);
  });
  it("excludes completed work from overdue and does not mark due-today work overdue", () => {
    expect(isOverdue(task, "2026-11-08")).toBe(true);
    expect(isOverdue(task, "2026-11-07")).toBe(false);
    expect(isOverdue({ ...task, status: "completed" }, "2026-11-08")).toBe(false);
  });
});
