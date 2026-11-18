import { describe, expect, it } from "vitest";
import {
  AI_SUGGESTION_STATUSES,
  parseAiAssistantSearch,
} from "./assistant-browsing";

describe("AI Assistant suggestion browsing state", () => {
  const reviewCase = "e74a3a6f-afcb-40a5-889c-f385e2ced992";

  it("preserves existing validated review-case links", () => {
    expect(parseAiAssistantSearch({ reviewCase })).toEqual({ reviewCase });
  });

  it("round-trips suggestion status and search from a bookmarked URL", () => {
    const encoded = new URLSearchParams({
      reviewCase, suggestionStatus: "validated", suggestionQ: "accrual & rent",
    });
    expect(parseAiAssistantSearch(Object.fromEntries(encoded))).toEqual({
      reviewCase, suggestionStatus: "validated", suggestionQ: "accrual & rent",
    });
  });

  it("supports every existing suggestion status", () => {
    for (const suggestionStatus of AI_SUGGESTION_STATUSES) {
      expect(parseAiAssistantSearch({ suggestionStatus })).toEqual({ suggestionStatus });
    }
  });

  it("ignores unknown query params and arbitrary destinations", () => {
    expect(parseAiAssistantSearch({
      suggestionStatus: "../settings",
      reviewCase: "https://evil.example",
      redirect: "https://evil.example",
      admin: true,
    })).toEqual({});
  });

  it("bounds free-text search and rejects unexpected types", () => {
    expect(parseAiAssistantSearch({ suggestionQ: "x".repeat(101) })).toEqual({});
    expect(parseAiAssistantSearch({ suggestionQ: ["draft"] })).toEqual({});
  });

  it("keeps valid filters even when the review case is malformed", () => {
    expect(parseAiAssistantSearch({
      reviewCase: "other-company",
      suggestionStatus: "rejected",
      suggestionQ: "invoice",
    })).toEqual({ suggestionStatus: "rejected", suggestionQ: "invoice" });
  });
});
