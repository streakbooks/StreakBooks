import { describe, expect, it } from "vitest";
import { validateCrmTerritoryDraft } from "@/lib/crm/territory-draft";

describe("validateCrmTerritoryDraft", () => {
  it("accepts a normal territory", () => {
    expect(validateCrmTerritoryDraft({ name: "APAC", sortOrder: 10 })).toBeNull();
  });

  it("rejects empty names", () => {
    expect(validateCrmTerritoryDraft({ name: "  ", sortOrder: 10 })).toMatch(/name/i);
  });
});
