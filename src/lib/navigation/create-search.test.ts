import { describe, expect, it } from "vitest";
import { omitCreateFromSearch, parseCreateSearchFlag } from "./create-search";

describe("create search helpers", () => {
  it("parses create flags", () => {
    expect(parseCreateSearchFlag({ create: true })).toBe(true);
    expect(parseCreateSearchFlag({ create: "true" })).toBe(true);
    expect(parseCreateSearchFlag({ create: "1" })).toBe(true);
    expect(parseCreateSearchFlag({ create: 1 })).toBe(true);
    expect(parseCreateSearchFlag({})).toBe(false);
    expect(parseCreateSearchFlag({ create: false })).toBe(false);
  });

  it("omits create without leaving undefined", () => {
    expect(omitCreateFromSearch({ create: true, tab: "register" })).toEqual({
      tab: "register",
    });
    expect(Object.hasOwn(omitCreateFromSearch({ create: true }), "create")).toBe(false);
  });
});
