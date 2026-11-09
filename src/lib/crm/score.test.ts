import { describe, expect, it } from "vitest";
import { computeCrmLeadScore } from "@/lib/crm/score";

describe("computeCrmLeadScore", () => {
  it("scores a fully qualified commercial lead deterministically", () => {
    const result = computeCrmLeadScore({
      email: "a@example.com",
      phone: "+1 555 0100",
      organizationName: "Acme",
      sourceId: "11111111-1111-1111-1111-111111111111",
      estimatedValueMinor: 250000,
      ownerUserId: "22222222-2222-2222-2222-222222222222",
      status: "qualified",
    });
    expect(result.score).toBe(100);
    expect(result.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(["email", "phone", "organization", "source", "value_high", "owner", "qualified"]),
    );
  });

  it("caps at 100 and scores empty lead as zero", () => {
    expect(computeCrmLeadScore({}).score).toBe(0);
    expect(
      computeCrmLeadScore({
        email: "a@b.c",
        phone: "1",
        organizationName: "X",
        sourceId: "11111111-1111-1111-1111-111111111111",
        estimatedValueMinor: 100000,
        ownerUserId: "22222222-2222-2222-2222-222222222222",
        status: "qualified",
      }).score,
    ).toBe(100);
  });
});