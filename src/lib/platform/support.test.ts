import { describe, expect, it } from "vitest";
import { isMissingSupportSchema, platformDate, supportRequestSchema } from "./support";
const valid = {
  companyId: "20000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
  minutes: 60,
  reason: "Investigate posting",
};
describe("supervised support boundary", () => {
  it("validates duration, reason and business identifiers before an RPC", () => {
    expect(supportRequestSchema.parse(valid).minutes).toBe(60);
    for (const input of [
      { minutes: 0 },
      { minutes: 241 },
      { minutes: 1.5 },
      { reason: "  " },
      { companyId: "arbitrary" },
      { requestId: "bad" },
    ]) {
      expect(supportRequestSchema.safeParse({ ...valid, ...input }).success).toBe(false);
    }
  });
  it("treats only missing schema errors as unavailable, never permission or network failures", () => {
    expect(isMissingSupportSchema({ code: "PGRST202" })).toBe(true);
    expect(isMissingSupportSchema({ code: "42883" })).toBe(true);
    for (const code of ["42501", "PGRST301", "ETIMEDOUT", "XX000"])
      expect(isMissingSupportSchema({ code })).toBe(false);
    expect(isMissingSupportSchema(null)).toBe(false);
  });
  it("does not invent a date for missing or invalid stored timestamps", () => {
    expect(platformDate(null)).toBe("Not recorded");
    expect(platformDate("not-a-date")).toBe("Invalid recorded date");
  });
});
