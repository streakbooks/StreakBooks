import { describe, expect, it } from "vitest";
import { crmStatusAppearance } from "@/lib/crm/status-appearance";

describe("crmStatusAppearance", () => {
  it("uses semantic variants for key CRM lifecycle states", () => {
    expect(crmStatusAppearance("qualified").variant).toBe("success");
    expect(crmStatusAppearance("won").variant).toBe("success");
    expect(crmStatusAppearance("lost").variant).toBe("danger");
    expect(crmStatusAppearance("paused").variant).toBe("warning");
    expect(crmStatusAppearance("completed").variant).toBe("complete");
  });
  it("provides readable labels for unknown and compound statuses", () => {
    expect(crmStatusAppearance("awaiting_review")).toEqual({
      variant: "neutral",
      label: "Awaiting Review",
    });
  });
});
