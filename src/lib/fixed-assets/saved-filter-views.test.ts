import { describe, expect, it } from "vitest";
import {
  normalizeAssetFilterView,
  parseSavedAssetFilterViews,
  removeAssetFilterView,
  saveAssetFilterView,
} from "./saved-filter-views";
import type { AssetRegisterFilters } from "./register-view";

const filters: AssetRegisterFilters = {
  search: "Laptop",
  status: "active",
  typeId: "type-1",
  accountId: "account-1",
  sort: "cost",
  descending: true,
};

describe("Fixed Assets saved filter views", () => {
  it("saves current filters, replaces an existing name and deletes exact selected views", () => {
    const first = saveAssetFilterView([], "Equipment", filters);
    expect(first).toHaveLength(1);
    expect(first[0]?.filters).toEqual(filters);
    const replaced = saveAssetFilterView(first, "equipment", { ...filters, search: "Printer" });
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.filters.search).toBe("Printer");
    expect(removeAssetFilterView(replaced, "equipment")).toEqual([]);
  });

  it("validates stale or malformed browser data and drops duplicate names", () => {
    expect(parseSavedAssetFilterViews("{broken")).toEqual([]);
    const raw = JSON.stringify([
      { name: "Computers", filters },
      { name: "computers", filters },
      { name: "Poison", filters: { ...filters, status: "unknown" } },
      { name: "<script>", filters },
    ]);
    const parsed = parseSavedAssetFilterViews(raw);
    expect(parsed.map((v) => v.name)).toEqual(["Computers", "<script>"]);
  });

  it("limits view names, search text and number of saved views", () => {
    expect(normalizeAssetFilterView({ name: "a".repeat(49), filters })).toBeNull();
    expect(
      normalizeAssetFilterView({
        name: "Long query",
        filters: { ...filters, search: "a".repeat(121) },
      }),
    ).toBeNull();
    let saved: ReturnType<typeof saveAssetFilterView> = [];
    for (let i = 0; i < 10; i++) saved = saveAssetFilterView(saved, "View " + i, filters);
    expect(() => saveAssetFilterView(saved, "Eleventh", filters)).toThrow(/up to 10/i);
    expect(
      parseSavedAssetFilterViews(
        JSON.stringify([
          ...saved,
          {
            name: "Extra",
            filters,
          },
        ]),
      ),
    ).toHaveLength(10);
  });

  it("preserves all filter values in a valid round-trip", () => {
    const original = saveAssetFilterView([], "General view", filters);
    expect(parseSavedAssetFilterViews(JSON.stringify(original))).toEqual(original);
  });
});
