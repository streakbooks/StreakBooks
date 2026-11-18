import { createFileRoute } from "@tanstack/react-router";

import { parseSettingsSearch } from "@/lib/settings/search";

import { SettingsPage } from "@/screens/settings";

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: parseSettingsSearch,
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
