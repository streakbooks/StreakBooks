import { describe, expect, it } from "vitest";
import { firmRequestVisualStatus } from "./request-visual-status";

describe("Firm request visual status", () => {
  const today = "2026-11-07";

  it("requires persisted completion or cancellation timestamps before claiming success", () => {
    expect(firmRequestVisualStatus({
      due_date: "2026-10-01",
      action_document_requests: { completed_at: "2026-10-06", cancelled_at: null },
    }, today)).toBe("completed");
    expect(firmRequestVisualStatus({
      due_date: "2026-10-01",
      action_document_requests: { completed_at: null, cancelled_at: "2026-10-04" },
    }, today)).toBe("cancelled");
  });

  it("warns for open overdue requests but not those due today or later", () => {
    expect(firmRequestVisualStatus({ due_date: "2026-11-06" }, today)).toBe("overdue");
    expect(firmRequestVisualStatus({ due_date: "2026-11-07" }, today)).toBe("open");
    expect(firmRequestVisualStatus({ due_date: "2026-11-08" }, today)).toBe("open");
  });

  it("does not infer overdue from malformed or missing dates", () => {
    expect(firmRequestVisualStatus({ due_date: "yesterday" }, today)).toBe("open");
    expect(firmRequestVisualStatus({ due_date: "" }, today)).toBe("open");
  });

  it("keeps completed records completed after their due date has passed", () => {
    expect(firmRequestVisualStatus({
      due_date: "2026-10-01",
      action_document_requests: { completed_at: "2026-10-01" },
    }, today)).toBe("completed");
  });
});
