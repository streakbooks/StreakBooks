import { createFileRoute } from "@tanstack/react-router";
import { PurchasesRequisitionsScreen } from "@/screens/purchases/requisitions";

export const Route = createFileRoute("/_authenticated/purchases/requisitions")({
  component: PurchasesRequisitionsScreen,
  staticData: {
    moduleId: "purchases",
    pageKind: "list",
  },
});
