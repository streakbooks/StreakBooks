import { describe, expect, it } from "vitest";
import { filterFeatureSettings } from "./feature-search";

const features = [
  { key: "fx", label: "Multicurrency", description: "Exchange rates", consumerModules: ["Sales"] },
  { key: "dimensions", label: "Tracking", description: "Assign classes", consumerModules: ["Bills"] },
];

describe("Feature Manager search", () => {
  it("matches labels, descriptions and module names without mutating the source", () => {
    expect(filterFeatureSettings(features, " multi ")).toEqual([features[0]]);
    expect(filterFeatureSettings(features, "exchange")).toEqual([features[0]]);
    expect(filterFeatureSettings(features, "bills")).toEqual([features[1]]);
    expect(filterFeatureSettings(features, "unrelated")).toEqual([]);
    expect(filterFeatureSettings(features, "")).toEqual(features);
  });
});
