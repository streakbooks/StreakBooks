import { describe, expect, it } from "vitest";
import { assertStepUp, stepUpAllows } from "./step-up";

describe("step-up MFA", () => {
  it("allows only aal2", () => {
    expect(stepUpAllows("aal2")).toBe(true);
    expect(stepUpAllows("aal1")).toBe(false);
    expect(stepUpAllows(null)).toBe(false);
  });

  it("refuses a session that has not stepped up", () => {
    expect(() => assertStepUp("aal1")).toThrow(/MFA session/);
    expect(() => assertStepUp("aal2")).not.toThrow();
  });
});
