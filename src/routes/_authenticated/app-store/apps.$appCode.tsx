import { createFileRoute } from "@tanstack/react-router";
import { AppStoreAppDetailPage } from "@/screens/app-store/app-detail";

export const Route = createFileRoute("/_authenticated/app-store/apps/$appCode")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.appCode} — App Store — LinkBooks`,
      },
    ],
  }),
  component: AppStoreAppDetailRoute,
});

function AppStoreAppDetailRoute() {
  const { appCode } = Route.useParams();
  return <AppStoreAppDetailPage appCode={appCode} />;
}
