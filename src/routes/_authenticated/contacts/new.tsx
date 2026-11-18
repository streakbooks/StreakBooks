import { createFileRoute } from "@tanstack/react-router";

import { NewContactRoute } from "@/screens/contacts/new";
import {
  decodeContactsReturnContext,
  encodeContactsReturnContext,
} from "@/lib/contacts/contact-view-navigation";

export const Route = createFileRoute("/_authenticated/contacts/new")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { kind?: "customer" | "supplier"; returnContext?: string | undefined } => ({
    kind: search["kind"] === "supplier" ? ("supplier" as const) : ("customer" as const),
    returnContext:
      typeof search["returnContext"] === "string"
        ? encodeContactsReturnContext(decodeContactsReturnContext(search["returnContext"])) ||
          undefined
        : undefined,
  }),
  head: () => ({ meta: [{ title: "New contact — LinkBooks" }] }),
  component: NewContactRoute,
});
