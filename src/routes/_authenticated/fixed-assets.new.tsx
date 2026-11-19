import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Browser-addressable New asset URL. Canonical editor remains the Fixed Assets
 * register workspace opened with sticky `?create=true` (Batch 55).
 */
export const Route = createFileRoute("/_authenticated/fixed-assets/new")({
  beforeLoad: () => {
    throw redirect({
      to: "/fixed-assets",
      search: { create: true },
    });
  },
});
