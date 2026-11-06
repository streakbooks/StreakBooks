import {
  formatAdvisorPlanPrice,
  getDefaultAdvisorService,
  type AdvisorService,
  type AdvisorServiceCode,
} from "@/lib/advisors/catalogue";

export type AdvisorChatRole = "assistant" | "visitor" | "system";

export type AdvisorChatMessage = {
  id: string;
  role: AdvisorChatRole;
  content: string;
  createdAt: string;
};

export type AdvisorQualificationAnswers = {
  businessType?: string;
  monthlyTransactions?: string;
  existingSoftware?: string;
  supportNeeds?: string;
  skipped?: boolean;
};

export type AdvisorChatState = {
  serviceCode: AdvisorServiceCode;
  step: "greet" | "q1" | "q2" | "q3" | "q4" | "recommend" | "handoff";
  answers: AdvisorQualificationAnswers;
  recommendedPlanCode: string | null;
  consentGiven: boolean;
};

const AI_DISCLOSURE =
  "I am the LinkBooks Advisors AI assistant. I can help with qualification and plan guidance. I cannot give regulated tax, audit or legal advice, and I do not invent prices or advisor availability.";

export function createInitialChatState(serviceCode: AdvisorServiceCode): AdvisorChatState {
  return {
    serviceCode,
    step: "greet",
    answers: {},
    recommendedPlanCode: null,
    consentGiven: false,
  };
}

export function serviceGreeting(service: AdvisorService, chatWelcome?: string): string {
  const welcome =
    chatWelcome?.trim() ||
    (service.code === "bookkeeping"
      ? "Thanks for choosing bookkeeping support."
      : "Thanks for choosing coaching.");
  return `${welcome}\n\n${AI_DISCLOSURE}\n\nYou can answer a few optional questions, skip them, or view plans now.`;
}

export function nextQuestion(state: AdvisorChatState): string | null {
  switch (state.step) {
    case "greet":
    case "q1":
      return "What type of business do you run? (for example sole trader, company, or nonprofit)";
    case "q2":
      return state.serviceCode === "bookkeeping"
        ? "About how many bank or card transactions do you have each month? (under 100, 100–300, 300–600, or more)"
        : "How often would you like coaching support? (one session, a couple of times a month, or weekly)";
    case "q3":
      return "Which accounting software do you use today, if any?";
    case "q4":
      return "What support do you need most right now?";
    default:
      return null;
  }
}

export function recommendPlanCode(
  serviceCode: AdvisorServiceCode,
  answers: AdvisorQualificationAnswers,
): string {
  if (serviceCode === "coaching") {
    const cadence = (answers.monthlyTransactions ?? answers.supportNeeds ?? "").toLowerCase();
    if (cadence.includes("week") || cadence.includes("four") || cadence.includes("intensive")) {
      return "business_coaching";
    }
    if (cadence.includes("couple") || cadence.includes("month") || cadence.includes("two")) {
      return "monthly_coaching";
    }
    return "quick_guidance";
  }
  const volume = (answers.monthlyTransactions ?? "").toLowerCase();
  if (
    volume.includes("more") ||
    volume.includes("600") ||
    volume.includes("300–600") ||
    volume.includes("300-600")
  ) {
    return "complete_books";
  }
  if (volume.includes("100–300") || volume.includes("100-300") || volume.includes("300")) {
    return "growth_books";
  }
  return "essential_books";
}

export function buildRecommendationMessage(service: AdvisorService, planCode: string): string {
  const plan = service.plans.find((item) => item.code === planCode) ?? service.plans[0];
  if (!plan) {
    return "I can show the published plans on this page. Prices come only from the LinkBooks Advisors catalogue.";
  }
  const siblings = service.plans
    .map((item) => `• ${item.name}: ${formatAdvisorPlanPrice(item)}`)
    .join("\n");
  return [
    `Based on what you shared, a good starting point is ${plan.name} at ${formatAdvisorPlanPrice(plan)}.`,
    plan.summary,
    "",
    "Published plan options for this service:",
    siblings,
    "",
    "Prices are catalogue defaults and may change when an administrator publishes updates. Taxes are shown before purchase. I can help you view plans, skip ahead, or request a human advisor handoff. Appointment booking arrives in the next Advisors batch.",
  ].join("\n");
}

export function applyVisitorReply(
  state: AdvisorChatState,
  text: string,
  service: AdvisorService = getDefaultAdvisorService(state.serviceCode),
): { state: AdvisorChatState; replies: string[] } {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const replies: string[] = [];
  let next = { ...state, answers: { ...state.answers } };

  if (!trimmed) {
    return { state, replies: ["Please share a short answer, or say “skip” to continue."] };
  }

  if (["view plans", "show plans", "plans"].includes(lower)) {
    next = {
      ...next,
      step: "recommend",
      recommendedPlanCode: recommendPlanCode(next.serviceCode, next.answers),
    };
    replies.push(buildRecommendationMessage(service, next.recommendedPlanCode!));
    replies.push(
      "You can keep chatting, ask for a human advisor, or review the plans shown on this page.",
    );
    return { state: next, replies };
  }

  if (
    ["human", "advisor", "handoff", "talk to a person", "speak to someone"].some((item) =>
      lower.includes(item),
    )
  ) {
    next = { ...next, step: "handoff" };
    replies.push(
      "I can note that you want a human advisor. You can book a free consultation now using the booking calendar — only real available times are shown.",
    );
    return { state: next, replies };
  }

  if (["skip", "skip questions", "later"].includes(lower) || lower.startsWith("skip")) {
    next = {
      ...next,
      step: "recommend",
      answers: { ...next.answers, skipped: true },
      recommendedPlanCode: recommendPlanCode(next.serviceCode, { ...next.answers, skipped: true }),
    };
    replies.push("No problem — questions are optional.");
    replies.push(buildRecommendationMessage(service, next.recommendedPlanCode!));
    return { state: next, replies };
  }

  switch (next.step) {
    case "greet":
    case "q1":
      next.answers.businessType = trimmed;
      next.step = "q2";
      break;
    case "q2":
      next.answers.monthlyTransactions = trimmed;
      next.step = "q3";
      break;
    case "q3":
      next.answers.existingSoftware = trimmed;
      next.step = "q4";
      break;
    case "q4":
      next.answers.supportNeeds = trimmed;
      next.step = "recommend";
      next.recommendedPlanCode = recommendPlanCode(next.serviceCode, next.answers);
      replies.push(buildRecommendationMessage(service, next.recommendedPlanCode));
      return { state: next, replies };
    case "recommend":
    case "handoff":
      replies.push(
        "You can say “view plans”, “skip”, or “human advisor”. I only use published LinkBooks Advisors catalogue prices.",
      );
      return { state: next, replies };
  }

  const question = nextQuestion(next);
  if (question) replies.push(question);
  return { state: next, replies };
}

export function openingMessages(
  service: AdvisorService,
  chatWelcome?: string,
): AdvisorChatMessage[] {
  const now = new Date().toISOString();
  const greet = serviceGreeting(service, chatWelcome);
  const question = nextQuestion({ ...createInitialChatState(service.code), step: "q1" });
  return [
    { id: `m-${now}-1`, role: "assistant", content: greet, createdAt: now },
    {
      id: `m-${now}-2`,
      role: "assistant",
      content: question ?? "You can view plans whenever you like.",
      createdAt: now,
    },
  ];
}
