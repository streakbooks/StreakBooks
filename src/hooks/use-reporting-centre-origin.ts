import { useRouterState } from "@tanstack/react-router";
import { encodeReportingCentreContext } from "@/lib/reports/centre-return";

/**
 * Keep report-detail links aware of the exact Reports Centre workspace.
 * Returning by native link works after refresh, deep-link and open-in-new-tab.
 * Pure sanitization is in lib/reports/centre-return.ts for server reuse.
 */
export function useReportingCentreOrigin(): string | undefined {
  const centreSearch = useRouterState({
    select: (state) =>
      state.location.pathname.replace(/\/$/, "") === "/reports"
        ? (state.location.search as Record<string, unknown>)
        : null,
  });
  if (!centreSearch) return undefined;
  return encodeReportingCentreContext(centreSearch) || undefined;
}
