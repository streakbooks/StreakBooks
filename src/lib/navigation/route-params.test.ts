import { describe, expect, it } from "vitest";
import { requireRouteUuid } from "./route-params";

describe("requireRouteUuid", () => {
  it("accepts a valid uuid", () => {
    expect(requireRouteUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("throws notFound for invalid ids", () => {
    expect(() => requireRouteUuid("not-a-uuid")).toThrow();
  });
});
