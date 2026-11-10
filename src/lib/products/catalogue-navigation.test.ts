import { describe, expect, it } from "vitest";
import {
  parseCatalogueSearch,
  parseProductSection,
  PRODUCT_SECTIONS,
} from "./catalogue-navigation";

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

describe("Catalogue list query context", () => {
  it("retains all permitted filters and pagination in direct deep links", () => {
    expect(parseCatalogueSearch({
      section: "price-lists",
      q: "Black & white",
      kind: "service",
      category: "178de295-8c4c-4aa1-9bcd-d3b7ce912345",
      status: "archived",
      sort: "price_desc",
      page: "3",
      pageSize: "100",
    })).toEqual({
      section: "price-lists",
      q: "Black & white",
      kind: "service",
      category: "178de295-8c4c-4aa1-9bcd-d3b7ce912345",
      status: "archived",
      sort: "price_desc",
      page: 3,
      pageSize: 100,
    });
  });

  it("uses catalogue defaults and ignores unsupported query keys", () => {
    expect(parseCatalogueSearch({
      section: "invalid",
      random: "hidden",
      redirect: "https://example.com/evil",
      page: 0,
      pageSize: 20,
    })).toEqual({ section: "catalogue" });
  });

  it("rejects injection-shaped categories, long search queries and unsupported enums", () => {
    expect(parseCatalogueSearch({
      section: "catalogue",
      q: "x".repeat(101),
      kind: "admin",
      category: "../../../other",
      status: "other",
      sort: "sql",
    })).toEqual({ section: "catalogue" });
  });

  it("allows all supported item kinds and orderings", () => {
    for (const kind of ["all", "service", "product", "non_inventory"]) {
      expect(parseCatalogueSearch({ kind }).kind).toBe(kind);
    }
    for (const sort of ["name", "name_desc", "code", "price_asc", "price_desc", "recent"]) {
      expect(parseCatalogueSearch({ sort }).sort).toBe(sort);
    }
    for (const status of ["all", "active", "archived"]) {
      expect(parseCatalogueSearch({ status }).status).toBe(status);
    }
  });

  it("bounds numeric pagination and rejects non-integers", () => {
    expect(parseCatalogueSearch({ page: "9999999", pageSize: 25 })).toEqual({
      section: "catalogue", page: 1_000_000, pageSize: 25,
    });
    expect(parseCatalogueSearch({ page: "1.5", pageSize: 0 })).toEqual({
      section: "catalogue",
    });
    expect(parseCatalogueSearch({ page: -1, pageSize: 999 })).toEqual({
      section: "catalogue",
    });
  });

  it("retains the current catalogue filters when changing sections", () => {
    const initial = parseCatalogueSearch({
      section: "catalogue", kind: "service", q: "support", page: 2,
    });
    expect(parseCatalogueSearch({ ...initial, section: "categories" })).toEqual({
      section: "categories", kind: "service", q: "support", page: 2,
    });
  });
});
