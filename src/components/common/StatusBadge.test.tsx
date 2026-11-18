import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge, StatusIndicator, StatusTimeline } from "./StatusBadge";
import { StatusBadge as ExistingStatusBadge } from "./stat-card";

describe("Live LinkBooks semantic status visuals", () => {
  it("renders a backend paid state in the distinct teal completion tone", () => {
    const markup = renderToStaticMarkup(<StatusBadge status="paid" />);
    expect(markup).toContain('data-tone="complete"');
    expect(markup).toContain("Paid");
    expect(markup).toContain("bg-complete-soft");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("differentiates approval, processing, rejection and draft", () => {
    for (const [status, tone] of [
      ["approved", "success"],
      ["posted", "success"],
      ["partly_paid", "info"],
      ["awaiting_approval", "warning"],
      ["rejected", "danger"],
      ["draft", "neutral"],
    ]) {
      expect(renderToStaticMarkup(<StatusBadge status={status} />)).toContain(
        'data-tone="' + tone + '"',
      );
    }
  });

  it("keeps labels accessible for muted statuses and in dense indicators", () => {
    const voided = renderToStaticMarkup(<StatusBadge status="void" />);
    expect(voided).toContain("Void");
    expect(voided).toContain('data-muted="true"');
    const indicator = renderToStaticMarkup(<StatusIndicator status="reconciled" />);
    expect(indicator).toContain("Reconciled");
    expect(indicator).toContain('data-tone="complete"');
  });

  it("updates when supplied status changes without inventing success", () => {
    const pending = renderToStaticMarkup(<StatusBadge status="pending" />);
    const paid = renderToStaticMarkup(<StatusBadge status="paid" />);
    expect(pending).toContain('data-tone="warning"');
    expect(paid).toContain('data-tone="complete"');
    expect(renderToStaticMarkup(<StatusBadge status="unrecognised_status" />)).toContain(
      'data-tone="neutral"',
    );
  });

  it("supports explicit, opt-in due date calculations without changing a persisted status", () => {
    const overdue = renderToStaticMarkup(
      <StatusBadge status="authorised" dueDate="2026-11-01" today="2026-11-07" />,
    );
    expect(overdue).toContain('data-tone="danger"');
    expect(overdue).toContain("Overdue");
    const current = renderToStaticMarkup(<StatusBadge status="authorised" />);
    expect(current).toContain("Awaiting payment");
  });

  it("retains compatibility with status chips already used in Sales, Purchases and Banking", () => {
    const markup = renderToStaticMarkup(
      <ExistingStatusBadge status="partly_paid" label="Part payment" />,
    );
    expect(markup).toContain('data-tone="info"');
    expect(markup).toContain("Part payment");
  });

  it("does not manufacture a status history when no backend events are supplied", () => {
    const markup = renderToStaticMarkup(<StatusTimeline events={[]} />);
    expect(markup).toContain("No recorded status changes");
    expect(markup).not.toContain("Approved");
  });

  it("renders only actual recorded events in a status timeline", () => {
    const markup = renderToStaticMarkup(
      <StatusTimeline
        events={[
          { id: "one", status: "submitted", occurredAt: "2026-11-01", actor: "Reviewer" },
          { id: "two", status: "approved", occurredAt: "2026-11-02" },
        ]}
      />,
    );
    expect(markup).toContain("Awaiting approval");
    expect(markup).toContain("Approved");
    expect(markup).not.toContain("Paid");
    expect(markup).toContain("Reviewer");
  });
});
