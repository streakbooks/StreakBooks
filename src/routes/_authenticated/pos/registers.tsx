import { createFileRoute } from "@tanstack/react-router";
import { PosRegistersScreen } from "@/screens/pos/registers";

export const Route = createFileRoute("/_authenticated/pos/registers")({
  component: PosRegistersScreen,
  staticData: {
    moduleId: "pos",
    pageKind: "list",
  },
});
