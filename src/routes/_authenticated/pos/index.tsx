import { createFileRoute } from "@tanstack/react-router";
import { PosScreen } from "@/screens/pos";

export const Route = createFileRoute("/_authenticated/pos/")({
  component: PosScreen,
  staticData: {
    moduleId: "pos",
    pageKind: "list",
  },
});
