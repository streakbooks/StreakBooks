import { createFileRoute } from "@tanstack/react-router";
import { PlatformOperations } from "@/components/platform/PlatformOperations";
import { parseOpsSearch } from "@/lib/platform/operations";
export const Route = createFileRoute("/_authenticated/platform/operations")({
  validateSearch: parseOpsSearch,
  component: OperationsPage,
  head: () => ({ meta: [{ title: "Operations — LinkBooks Superadmin" }] }),
});
function OperationsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PlatformOperations
      {...search}
      onOpen={(item) => void navigate({ search: { ...search, item } })}
      onModule={(module) => void navigate({ search: { module } })}
      onClose={() => void navigate({ search: { ...search, item: undefined }, replace: true })}
    />
  );
}
