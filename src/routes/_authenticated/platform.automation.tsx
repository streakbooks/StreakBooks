import { createFileRoute } from "@tanstack/react-router";
import { PlatformAutomation } from "@/components/platform/PlatformAutomation";
import { parseAutomationSearch } from "@/lib/platform/automation";
export const Route = createFileRoute("/_authenticated/platform/automation")({
  validateSearch: parseAutomationSearch,
  component: AutomationPage,
  head: () => ({ meta: [{ title: "Jobs and alerts — StreakBooks Superadmin" }] }),
});
function AutomationPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PlatformAutomation
      {...search}
      onOpen={(item) => void navigate({ search: { ...search, item } })}
      onClose={() => void navigate({ search: { ...search, item: undefined }, replace: true })}
      onModule={(module) => void navigate({ search: { module } })}
    />
  );
}
