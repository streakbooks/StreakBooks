import { createFileRoute } from "@tanstack/react-router";

import { AiAssistantPage } from "@/screens/ai-assistant";
import { parseAiAssistantSearch } from "@/lib/ai/assistant-browsing";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  validateSearch: parseAiAssistantSearch,
  head: () => ({
    meta: [
      { title: "AI Assistant — StreakBooks" },
      {
        name: "description",
        content: "Accounting guidance and review suggestions, always subject to user approval.",
      },
      { property: "og:title", content: "AI Assistant — StreakBooks" },
      {
        property: "og:description",
        content: "Accounting guidance and review suggestions, always subject to user approval.",
      },
    ],
  }),
  component: AiAssistantPage,
});
