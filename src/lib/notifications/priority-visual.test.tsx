import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { notificationPriorityDisplay } from "./priority-visual";
import { NotificationPriorityBadge } from "@/components/notifications/NotificationPriorityBadge";

describe("Action Center priority semantics", () => {
  it("never confuses high priority with an approved or paid document", () => {
    expect(notificationPriorityDisplay("critical")).toMatchObject({
      label: "Critical", tone: "danger",
    });
    expect(notificationPriorityDisplay("high")).toMatchObject({
      label: "High priority", tone: "warning",
    });
    expect(notificationPriorityDisplay("normal").tone).toBe("info");
    expect(notificationPriorityDisplay("low").tone).toBe("neutral");
  });

  it("uses neutral, safe labels for missing or unsupported priorities", () => {
    expect(notificationPriorityDisplay(null).priority).toBe("unknown");
    expect(notificationPriorityDisplay("admin").tone).toBe("neutral");
    expect(notificationPriorityDisplay("../critical").label).toBe("Unspecified");
  });

  it("has a visible text label and aria-hidden icon, not colour alone", () => {
    const markup = renderToStaticMarkup(<NotificationPriorityBadge priority="critical" />);
    expect(markup).toContain("Critical");
    expect(markup).toContain('data-priority="critical"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("bg-destructive-soft");
  });

  it("renders warning and unknown cases without pretending they are successful", () => {
    expect(renderToStaticMarkup(<NotificationPriorityBadge priority="high" />))
      .toContain('data-priority="high"');
    expect(renderToStaticMarkup(<NotificationPriorityBadge priority="unknown" />))
      .toContain("Unspecified");
  });
});
