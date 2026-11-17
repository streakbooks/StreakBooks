import { describe, expect, it } from "vitest";
import { hasAsciiControlCharacters } from "./text-validation";
describe("single-line ASCII control validation", () => {
  it("rejects every C0 control and DEL while retaining normal Unicode text", () => {
    for (let code = 0; code < 32; code++)
      expect(hasAsciiControlCharacters(`a${String.fromCharCode(code)}b`)).toBe(true);
    expect(hasAsciiControlCharacters(`a${String.fromCharCode(127)}b`)).toBe(true);
    expect(hasAsciiControlCharacters("Evidence: café / ₹ / 中文")).toBe(false);
  });
});
