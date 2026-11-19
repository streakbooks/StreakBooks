import { createFileRoute } from "@tanstack/react-router";
import { PurchasesRequisitionsScreen } from "@/screens/purchases/requisitions";
import { parseCreateSearchFlag } from "@/lib/navigation/create-search";

export const Route = createFileRoute("/_authenticated/purchases/requisitions")({
  validateSearch: (raw: Record<string, unknown>): { create?: boolean } =>
    parseCreateSearchFlag(raw) ? { create: true } : {},
  component: PurchasesRequisitionsRoute,
  staticData: {
    moduleId: "purchases",
    pageKind: "list",
  },
});

function PurchasesRequisitionsRoute() {
  const { create } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PurchasesRequisitionsScreen
      forceCreate={Boolean(create)}
      onCreateClosed={() => {
        if (!create) return;
        void navigate({
          search: (prev) => {
            const { create: _create, ...rest } = prev;
            return rest;
          },
          replace: true,
        });
      }}
    />
  );
}
