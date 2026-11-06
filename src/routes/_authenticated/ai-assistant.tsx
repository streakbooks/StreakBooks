import { createFileRoute } from "@tanstack/react-router";

import { AiAssistantPage } from "@/screens/ai-assistant";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — LinkBooks" },
      {
        name: "description",
        content: "Accounting guidance and review suggestions, always subject to user approval.",
      },
      { property: "og:title", content: "AI Assistant — LinkBooks" },
      {
        property: "og:description",
        content: "Accounting guidance and review suggestions, always subject to user approval.",
      },
    ],
  }),
  component: AiAssistantPage,
});
