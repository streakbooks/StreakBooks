import { createFileRoute } from "@tanstack/react-router";

import { AiAssistantPage } from "@/screens/ai-assistant";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  validateSearch: (raw: Record<string, unknown>): { reviewCase?: string } => {
    const reviewCaseRaw = raw["reviewCase"];
    if (
      typeof reviewCaseRaw === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewCaseRaw)
    ) {
      return { reviewCase: reviewCaseRaw };
    }
    return {};
  },
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
