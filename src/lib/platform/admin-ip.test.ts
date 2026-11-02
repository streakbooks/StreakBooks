import { describe, expect, it } from "vitest";
import { adminIpDecision } from "./admin-ip";

describe("admin IP allowlist", () => {
  it("stays closed when no allowlist is configured", () => {
    expect(adminIpDecision("203.0.113.8", [])).toEqual({
      status: "unconfigured",
      allowed: false,
    });
    expect(adminIpDecision("203.0.113.8", ["  "])).toEqual({
      status: "unconfigured",
      allowed: false,
    });
  });

  it("allows only an exact configured address", () => {
    expect(adminIpDecision(" 203.0.113.8 ", ["203.0.113.8"])).toEqual({
      status: "allowed",
      allowed: true,
    });
    expect(adminIpDecision("203.0.113.9", ["203.0.113.8"])).toEqual({
      status: "denied",
      allowed: false,
    });
    expect(adminIpDecision(null, ["203.0.113.8"])).toEqual({
      status: "denied",
      allowed: false,
    });
  });
});
