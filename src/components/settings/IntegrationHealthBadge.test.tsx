import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntegrationHealthBadge } from "./IntegrationHealthBadge";

describe("Settings integration health badges", () => {
  it("identifies configured services as info, not successful delivery", () => {
    const markup = renderToStaticMarkup(<IntegrationHealthBadge status="configured" />);
    expect(markup).toContain("Configured");
    expect(markup).toContain('data-integration-status="configured"');
    expect(markup).toContain("bg-info-soft");
    expect(markup).not.toContain("Connected");
    expect(markup).not.toContain("Verified");
  });

  it("shows missing setup as pending configuration rather than a failure", () => {
    const markup = renderToStaticMarkup(<IntegrationHealthBadge status="not_configured" />);
    expect(markup).toContain("Not configured");
    expect(markup).toContain("bg-warning-soft");
  });

  it("treats demo restrictions and unimplemented integrations neutrally", () => {
    for (const status of ["restricted", "unavailable"] as const) {
      const markup = renderToStaticMarkup(<IntegrationHealthBadge status={status} />);
      expect(markup).toContain('data-integration-status="' + status + '"');
      expect(markup).toContain("bg-neutral-soft");
    }
  });

  it("provides visible labels and a decorative icon that screen readers ignore", () => {
    const markup = renderToStaticMarkup(<IntegrationHealthBadge status="configured" />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-slot="integration-health-badge"');
  });
});
