import { createFileRoute } from "@tanstack/react-router";
import { MessagesScreen } from "@/screens/messages";
import type { MessagingInboxFilter } from "@/lib/messaging/types";

const FILTERS = new Set<MessagingInboxFilter>([
  "inbox",
  "dm",
  "groups",
  "mentions",
  "unread",
  "starred",
  "files",
  "archived",
  "transactions",
  "search",
]);

type MessagesSearch = {
  conversation?: string;
  filter?: MessagingInboxFilter;
  q?: string;
};

export const Route = createFileRoute("/_authenticated/messages/")({
  validateSearch: (search: Record<string, unknown>): MessagesSearch => {
    const conversationRaw = search["conversation"];
    const conversation =
      typeof conversationRaw === "string" && /^[0-9a-f-]{36}$/i.test(conversationRaw)
        ? conversationRaw
        : undefined;
    const filterRaw = typeof search["filter"] === "string" ? search["filter"] : "inbox";
    const filter = FILTERS.has(filterRaw as MessagingInboxFilter)
      ? (filterRaw as MessagingInboxFilter)
      : "inbox";
    const qRaw = search["q"];
    const q = typeof qRaw === "string" ? qRaw.slice(0, 120) : undefined;
    const result: MessagesSearch = { filter };
    if (conversation) result.conversation = conversation;
    if (q) result.q = q;
    return result;
  },
  component: MessagesRoute,
});

function MessagesRoute() {
  const search = Route.useSearch();
  return (
    <MessagesScreen
      {...(search.conversation ? { conversationId: search.conversation } : {})}
      filter={search.filter ?? "inbox"}
      {...(search.q ? { searchQuery: search.q } : {})}
    />
  );
}
