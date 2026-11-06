import { describe, expect, it } from "vitest";
import {
  applyVisitorReply,
  createInitialChatState,
  recommendPlanCode,
  serviceGreeting,
} from "@/lib/advisors/chat-engine";
import { getDefaultAdvisorService } from "@/lib/advisors/catalogue";

describe("advisors chat engine", () => {
  it("identifies itself as AI and never opens before service selection state exists", () => {
    const service = getDefaultAdvisorService("bookkeeping");
    expect(serviceGreeting(service)).toMatch(/AI assistant/i);
  });

  it("allows skipping questions and still recommends a catalogue plan", () => {
    const state = {
      ...createInitialChatState("bookkeeping"),
      step: "q1" as const,
      consentGiven: true,
    };
    const result = applyVisitorReply(state, "skip");
    expect(result.state.answers.skipped).toBe(true);
    expect(result.state.recommendedPlanCode).toBe("essential_books");
    expect(result.replies.join(" ")).toMatch(/Essential Books/);
    expect(result.replies.join(" ")).toMatch(/\$199/);
  });

  it("recommends growth books for mid volume answers", () => {
    expect(recommendPlanCode("bookkeeping", { monthlyTransactions: "about 100-300 a month" })).toBe(
      "growth_books",
    );
  });

  it("supports view plans and human handoff intents", () => {
    const state = {
      ...createInitialChatState("coaching"),
      step: "q2" as const,
      consentGiven: true,
    };
    const plans = applyVisitorReply(state, "view plans");
    expect(plans.state.recommendedPlanCode).toBeTruthy();
    expect(plans.replies.join(" ")).toMatch(/Quick Guidance|Monthly Coaching|Business Coaching/);
    const handoff = applyVisitorReply(plans.state, "talk to a human advisor");
    expect(handoff.state.step).toBe("handoff");
  });
});
