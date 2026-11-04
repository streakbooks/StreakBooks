import { describe, expect, it } from "vitest";
import {
  normalizeContactTimelineFilter,
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

  it("restricts timeline filters to allowlisted modes", () => {
    expect(normalizeContactTimelineFilter("open_tasks")).toBe("open_tasks");
    expect(normalizeContactTimelineFilter("completed_tasks")).toBe("completed_tasks");
    expect(normalizeContactTimelineFilter("arbitrary")).toBe("all");
  });
});
