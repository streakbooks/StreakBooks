import { describe, expect, it } from "vitest";
import { messagingPushPermissionLabel } from "./push-permission";

describe("messaging push permission labels", () => {
  it("labels permission states", () => {
    expect(messagingPushPermissionLabel("granted")).toContain("allowed");
    expect(messagingPushPermissionLabel("denied")).toContain("blocked");
    expect(messagingPushPermissionLabel("unsupported")).toContain("unsupported");
  });
});
