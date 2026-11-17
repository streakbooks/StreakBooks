import { describe, expect, it } from "vitest";
import { bodyMentionsUser, extractMentionTokens, insertMentionToken } from "./mentions";

describe("messaging mentions", () => {
  it("extracts @tokens from plain text", () => {
    expect(extractMentionTokens("Hi @Ada and @everyone")).toEqual(["ada", "everyone"]);
  });

  it("inserts a mention into the composer", () => {
    expect(insertMentionToken("", "Ada Lovelace")).toBe("@Ada Lovelace ");
    expect(insertMentionToken("Hello", "Ada")).toBe("Hello @Ada ");
  });

  it("detects whether a body mentions a user label", () => {
    expect(bodyMentionsUser("Ping @Ada", ["Ada"])).toBe(true);
    expect(bodyMentionsUser("Ping @everyone", ["Bob"])).toBe(true);
    expect(bodyMentionsUser("No tags", ["Ada"])).toBe(false);
  });
});
