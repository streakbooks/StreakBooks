import { describe, expect, it } from "vitest";
import { messagingConnectionLabel } from "./use-messaging-connection";

describe("messagingConnectionLabel", () => {
  it("labels realtime health states", () => {
    expect(messagingConnectionLabel("connected")).toBe("Live");
    expect(messagingConnectionLabel("reconnecting")).toBe("Reconnecting…");
    expect(messagingConnectionLabel("offline")).toBe("Offline");
    expect(messagingConnectionLabel("error")).toBe("Connection error");
  });
});
