import { createFileRoute } from "@tanstack/react-router";

import { resolveSettingsCategory } from "@/lib/settings/registry";

import { SettingsPage } from "@/screens/settings";

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { section: string; plan?: string; interval?: "month" | "year" } => {
    const raw = search["section"];
    const plan =
      typeof search["plan"] === "string" && search["plan"].length > 0 ? search["plan"] : undefined;
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
