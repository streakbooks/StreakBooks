import { describe, expect, it } from "vitest";
import { parseProductSection, PRODUCT_SECTIONS } from "./catalogue-navigation";

describe("Products & Services deep-link sections", () => {
  it("accepts every supported section", () => {
    for (const section of PRODUCT_SECTIONS) {
      expect(parseProductSection(section)).toBe(section);
    }
  });

  it("defaults to catalogue for missing or malformed URLs", () => {
    expect(parseProductSection(undefined)).toBe("catalogue");
    expect(parseProductSection(null)).toBe("catalogue");
    expect(parseProductSection("")).toBe("catalogue");
    expect(parseProductSection("/products-services")).toBe("catalogue");
  });

  it("rejects unsupported paths and unrelated sections", () => {
    expect(parseProductSection("https://example.com")).toBe("catalogue");
    expect(parseProductSection("../settings")).toBe("catalogue");
    expect(parseProductSection("admin")).toBe("catalogue");
    expect(parseProductSection(["price-lists"])).toBe("catalogue");
  });
});
