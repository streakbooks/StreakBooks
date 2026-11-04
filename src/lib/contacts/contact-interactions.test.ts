import { describe, expect, it } from "vitest";
import {
  normalizeContactTimelineFilter,
  normalizeContactFollowUpScope,
  contactFollowUpDateRange,
  validateContactInteractionDraft,
} from "./contact-interactions";

describe("Contact interaction input", () => {
  it("normalizes interaction content and accepts a task due date", () => {
    expect(
      validateContactInteractionDraft({
        kind: "task",
        title: "  Follow up with client  ",
        detail: "  Discuss the missing bank statement  ",
        dueOn: "2026-12-04",
      }),
    ).toEqual({
      kind: "task",
      title: "Follow up with client",
      detail: "Discuss the missing bank statement",
      dueOn: "2026-12-04",
      remindOn: null,
    });
  });

  it("supports notes, calls, emails and meetings without a due date", () => {
    for (const kind of ["note", "call", "email", "meeting"]) {
      expect(validateContactInteractionDraft({ kind, title: "Discussed renewal" })).toMatchObject({
        kind,
        title: "Discussed renewal",
        dueOn: null,
      });
    }
  });

  it("rejects invalid or blank activity and oversized content", () => {
    expect(() => validateContactInteractionDraft({ kind: "unknown", title: "Hello" })).toThrow(
      "valid interaction",
    );
    expect(() => validateContactInteractionDraft({ kind: "note", title: "  " })).toThrow(
      "Title must",
    );
    expect(() => validateContactInteractionDraft({ kind: "note", title: "x".repeat(161) })).toThrow(
      "Title must",
    );
    expect(() =>
      validateContactInteractionDraft({ kind: "note", title: "Good", detail: "x".repeat(4001) }),
    ).toThrow("4,000");
  });

  it("rejects invalid dates and due dates on non-tasks", () => {
    expect(() =>
      validateContactInteractionDraft({ kind: "task", title: "Pay", dueOn: "2026-02-30" }),
    ).toThrow("valid follow-up date");
    expect(() =>
      validateContactInteractionDraft({ kind: "note", title: "Call back", dueOn: "2026-12-04" }),
    ).toThrow("Only tasks");
  });

  it("validates reminder dates and task ownership requirements", () => {
    expect(
      validateContactInteractionDraft({
        kind: "task",
        title: "Call supplier",
        dueOn: "2026-12-04",
        remindOn: "2026-12-01",
      }),
    ).toMatchObject({ remindOn: "2026-12-01", dueOn: "2026-12-04" });
    expect(() =>
      validateContactInteractionDraft({
        kind: "task",
        title: "Call supplier",
        remindOn: "2026-12-01",
      }),
    ).toThrow("on or before");
    expect(() =>
      validateContactInteractionDraft({
        kind: "task",
        title: "Call supplier",
        dueOn: "2026-12-01",
        remindOn: "2026-12-02",
      }),
    ).toThrow("on or before");
    expect(() =>
      validateContactInteractionDraft({
        kind: "note",
        title: "Call supplier",
        remindOn: "2026-12-01",
      }),
    ).toThrow("Only tasks");
  });

  it("uses the organisation's local calendar day when computing upcoming reminders", () => {
    const now = new Date("2026-11-04T23:30:00Z");
    expect(contactFollowUpDateRange(now, "Asia/Kolkata")).toEqual({
      today: "2026-11-05",
      until: "2026-11-12",
    });
    expect(contactFollowUpDateRange(now, "America/Los_Angeles")).toEqual({
      today: "2026-11-04",
      until: "2026-11-11",
    });
    expect(normalizeContactFollowUpScope("team")).toBe("team");
    expect(normalizeContactFollowUpScope("unknown")).toBe("mine");
  });

  it("restricts timeline filters to allowlisted modes", () => {
    expect(normalizeContactTimelineFilter("open_tasks")).toBe("open_tasks");
    expect(normalizeContactTimelineFilter("completed_tasks")).toBe("completed_tasks");
    expect(normalizeContactTimelineFilter("arbitrary")).toBe("all");
  });
});
