import { createFileRoute } from "@tanstack/react-router";
import { PortalMessages } from "@/components/portals/customer-pages";

type PortalMessagesSearch = {
  conversation?: string;
};

export const Route = createFileRoute("/portal/app/messages")({
  validateSearch: (search: Record<string, unknown>): PortalMessagesSearch => {
    const conversationRaw = search["conversation"];
    const conversation =
      typeof conversationRaw === "string" && /^[0-9a-f-]{36}$/i.test(conversationRaw)
        ? conversationRaw
        : undefined;
    return conversation ? { conversation } : {};
  },
  component: PortalMessagesRoute,
});

function PortalMessagesRoute() {
  const { conversation } = Route.useSearch();
  return <PortalMessages conversationId={conversation} />;
}
