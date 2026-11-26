import { createFileRoute, redirect } from "@tanstack/react-router";

import { SettingsPage } from "@/screens/settings";
import { parseSettingsSearch } from "@/lib/settings/search";
import { resolveSettingsRoute } from "@/lib/settings/route-model";

export const Route = createFileRoute("/_authenticated/settings/$group/$page")({
  validateSearch: parseSettingsSearch,
  beforeLoad: ({ params }) => {
    if (!resolveSettingsRoute(params.group, params.page)) {
      throw redirect({ to: "/settings", search: { section: "overview" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Settings — StreakBooks" },
      { name: "description", content: "Organisation and personal settings for StreakBooks." },
    ],
  }),
  component: SettingsPage,
});
