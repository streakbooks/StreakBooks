import { describe, expect, it } from "vitest";
import { validatePipelineDraft, validatePipelineStageDraft } from "@/lib/crm/pipeline-admin";

describe("pipeline-admin validation", () => {
  it("accepts a normal open stage", () => {
    expect(
      validatePipelineStageDraft({
        name: "Proposal",
        probabilityPct: 50,
        sortOrder: 30,
        isWon: false,
        isLost: false,
        isActive: true,
      }),
    ).toBeNull();
  });

  it("rejects won+lost and empty names", () => {
    expect(
      validatePipelineStageDraft({
        name: "X",
        probabilityPct: 100,
        sortOrder: 10,
        isWon: true,
        isLost: true,
        isActive: true,
      }),
    ).toMatch(/won and lost/i);
    expect(
      validatePipelineStageDraft({
        name: "  ",
        probabilityPct: 0,
        sortOrder: 10,
        isWon: false,
        isLost: false,
        isActive: true,
      }),
    ).toMatch(/name/i);
  });

  it("validates pipeline names", () => {
    expect(validatePipelineDraft({ name: "Enterprise", sortOrder: 20 })).toBeNull();
    expect(validatePipelineDraft({ name: "", sortOrder: 20 })).toMatch(/name/i);
  });
});
