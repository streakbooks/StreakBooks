import { describe, expect, it, beforeEach } from "vitest";
import {
  clearMessagingComposerDraft,
  loadMessagingComposerDraft,
  messagingDraftKey,
  saveMessagingComposerDraft,
} from "./composer-drafts";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      clear: () => memory.clear(),
    },
  });
});

describe("messaging composer drafts", () => {
  it("saves and loads drafts per company/conversation", () => {
    const companyId = "00000000-0000-4000-8000-000000000001";
    const conversationId = "00000000-0000-4000-8000-000000000002";
    expect(messagingDraftKey(companyId, conversationId)).toContain(companyId);
    saveMessagingComposerDraft(companyId, conversationId, "Hello draft");
    expect(loadMessagingComposerDraft(companyId, conversationId)).toBe("Hello draft");
    clearMessagingComposerDraft(companyId, conversationId);
    expect(loadMessagingComposerDraft(companyId, conversationId)).toBe("");
  });
});
