import { createFileRoute } from "@tanstack/react-router";

import { BrandingPage } from "@/screens/documents.branding";

export const Route = createFileRoute("/_authenticated/documents/branding")({
  validateSearch: (input: Record<string, unknown>) => ({
    from: input["from"] === "purchases" ? ("purchases" as const) : ("sales" as const),
  }),
  head: () => ({ meta: [{ title: "Document branding — StreakBooks" }] }),
  component: BrandingPage,
});
