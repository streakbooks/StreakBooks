import { createFileRoute } from "@tanstack/react-router";
import { PurchasesRequisitionsScreen } from "@/screens/purchases/requisitions";

export const Route = createFileRoute("/_authenticated/purchases/requisitions")({
  validateSearch: (raw: Record<string, unknown>): { create?: boolean } => {
    const create =
      raw["create"] === true ||
      raw["create"] === "true" ||
      raw["create"] === "1" ||
      raw["create"] === 1;
    return create ? { create: true } : {};
  },
  component: PurchasesRequisitionsRoute,
  staticData: {
    moduleId: "purchases",
    pageKind: "list",
  },
});

function PurchasesRequisitionsRoute() {
  const { create } = Route.useSearch();
  return <PurchasesRequisitionsScreen forceCreate={Boolean(create)} />;
}
