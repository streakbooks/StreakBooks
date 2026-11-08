import { createFileRoute } from "@tanstack/react-router";

import { resolveSettingsCategory } from "@/lib/settings/registry";

import { SettingsPage } from "@/screens/settings";

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { section: string; plan?: string; interval?: "month" | "year" } => {
    const raw = search["section"];
    // Bound URL-controlled plan identifiers before passing them to billing UI.\n    // Keep valid plan slugs intact so existing deep links continue to work.\n    const plan =\n      typeof search["plan"] === "string" &&\n      /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(search["plan"])\n        ? search["plan"]\n        : undefined;
    const interval =
      search["interval"] === "month" || search["interval"] === "year"
        ? search["interval"]
        : undefined;
    return {
      section: resolveSettingsCategory(raw),
      ...(plan ? { plan } : {}),
      ...(interval ? { interval } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Settings — LinkBooks" },
      {
        name: "description",
        content:
          "Settings Centre: organisation governance, feature manager, lock dates, dimensions, documents, FX, users and audit.",
      },
      { property: "og:title", content: "Settings — LinkBooks" },
      {
        property: "og:description",
        content:
          "Settings Centre: organisation governance, feature manager, lock dates, dimensions, documents, FX, users and audit.",
      },
    ],
  }),
  component: SettingsPage,
});
