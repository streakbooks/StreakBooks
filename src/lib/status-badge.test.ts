import { describe, expect, it } from "vitest";
import { effectiveStatus, humanizeStatus, statusDisplay } from "./status-badge";

describe("statusDisplay", () => {
  it("maps the document lifecycle to consistent labels and tones", () => {
    expect(statusDisplay("draft")).toMatchObject({ label: "Draft", tone: "neutral" });
    expect(statusDisplay("awaiting_approval")).toMatchObject({
      label: "Awaiting approval",
      tone: "warning",
    });
    expect(statusDisplay("authorised")).toMatchObject({ label: "Awaiting payment", tone: "info" });
    expect(statusDisplay("paid")).toMatchObject({ label: "Paid", tone: "complete" });
    expect(statusDisplay("overdue")).toMatchObject({ label: "Overdue", tone: "danger" });
    expect(statusDisplay("void")).toMatchObject({ label: "Void", muted: true });
  });
  it("distinguishes approved green, completed teal, pending amber and overdue red", () => {
    expect(statusDisplay("approved")).toMatchObject({ tone: "success", label: "Approved" });
    expect(statusDisplay("posted")).toMatchObject({ tone: "success", label: "Posted" });
    for (const status of ["paid", "completed", "reconciled", "reimbursed"]) {
      expect(statusDisplay(status).tone).toBe("complete");
    }
    expect(statusDisplay("partly_paid").tone).toBe("info");
    expect(statusDisplay("processing").tone).toBe("info");
    expect(statusDisplay("pending").tone).toBe("warning");
    expect(statusDisplay("rejected").tone).toBe("danger");
    expect(statusDisplay("failed").tone).toBe("danger");
    expect(statusDisplay("cancelled").muted).toBe(true);
  });

  it("shows real contact, fixed-asset and product lifecycle states without inventing success", () => {
    expect(statusDisplay("open")).toMatchObject({ label: "Open", tone: "info" });
    expect(statusDisplay("completed")).toMatchObject({ label: "Completed", tone: "complete" });
    expect(statusDisplay("active")).toMatchObject({ label: "Active", tone: "success" });
    expect(statusDisplay("archived")).toMatchObject({ label: "Archived", tone: "neutral", muted: true });
    expect(statusDisplay("not_acquired")).toMatchObject({ label: "Future purchase", tone: "neutral" });
    expect(statusDisplay("disposed")).toMatchObject({ label: "Disposed", tone: "neutral", muted: true });
  });

  it("distinguishes AI suggestions ready for review from actually applied", () => {
    expect(statusDisplay("validated")).toMatchObject({
      label: "Validated for review", tone: "info",
    });
    expect(statusDisplay("applied")).toMatchObject({ label: "Applied", tone: "complete" });
    expect(statusDisplay("invalid")).toMatchObject({ label: "Invalid", tone: "danger" });
    expect(statusDisplay("pending")).toMatchObject({ label: "Pending", tone: "warning" });
    expect(statusDisplay("rejected")).toMatchObject({ label: "Rejected", tone: "danger" });
  });

  it("distinguishes actual App Store connection and health states", () => {
    expect(statusDisplay("connected")).toMatchObject({ label: "Connected", tone: "info" });
    expect(statusDisplay("disconnected")).toMatchObject({
      label: "Disconnected", tone: "neutral", muted: true,
    });
    expect(statusDisplay("healthy")).toMatchObject({ label: "Healthy", tone: "success" });
    expect(statusDisplay("degraded")).toMatchObject({ label: "Degraded", tone: "warning" });
    expect(statusDisplay("unhealthy")).toMatchObject({ label: "Unhealthy", tone: "danger" });
    expect(statusDisplay("unknown")).toMatchObject({ label: "Unknown", tone: "neutral" });
    expect(statusDisplay("CONNECTED").tone).toBe("info");
    expect(statusDisplay("unfamiliar_health").tone).toBe("neutral");
  });

  it("keeps accountant journals separate from payment completion", () => {
    expect(statusDisplay("posted")).toMatchObject({ label: "Posted", tone: "success" });
    expect(statusDisplay("reversed")).toMatchObject({ label: "Reversed", tone: "neutral", muted: true });
    expect(statusDisplay("paid")).toMatchObject({ label: "Paid", tone: "complete" });
  });

  it("covers bank statement line statuses", () => {
    expect(statusDisplay("uncategorised")).toMatchObject({ label: "For review", tone: "warning" });
    expect(statusDisplay("matched").tone).toBe("info");
    expect(statusDisplay("excluded").muted).toBe(true);
  });
  it("is case, space and underscore insensitive", () => {
    expect(statusDisplay("Awaiting payment").label).toBe("Awaiting payment");
    expect(statusDisplay("PARTLY_PAID").tone).toBe("info");
  });
  it("falls back to a neutral humanised label for unknown statuses", () => {
    expect(statusDisplay("on_hold")).toEqual({ label: "On hold", tone: "neutral" });
    expect(statusDisplay(null).label).toBe("—");
  });
});

describe("effectiveStatus", () => {
  it("promotes open past-due documents to overdue", () => {
    expect(effectiveStatus("authorised", "2026-10-01", "2026-10-23")).toBe("overdue");
    expect(effectiveStatus("partly_paid", "2026-10-22", "2026-10-23")).toBe("overdue");
  });
  it("leaves current, paid, draft and void documents alone", () => {
    expect(effectiveStatus("authorised", "2026-10-23", "2026-10-23")).toBe("authorised");
    expect(effectiveStatus("paid", "2026-01-01", "2026-10-23")).toBe("paid");
    expect(effectiveStatus("draft", "2026-01-01", "2026-10-23")).toBe("draft");
    expect(effectiveStatus("void", "2026-01-01", "2026-10-23")).toBe("void");
    expect(effectiveStatus("authorised", null, "2026-10-23")).toBe("authorised");
  });
});

describe("humanizeStatus", () => {
  it("capitalises and spaces", () => {
    expect(humanizeStatus("partly_paid")).toBe("Partly paid");
    expect(humanizeStatus("")).toBe("—");
  });
});
