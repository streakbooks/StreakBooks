import { describe, expect, it } from "vitest";
import { parseLineGridClipboard } from "@/lib/ui/line-grid-paste";

describe("parseLineGridClipboard", () => {
  it("parses tab-separated spreadsheet rows", () => {
    expect(parseLineGridClipboard("1\t10.00\t0\n2\t5.50\t1.00\n")).toEqual([
      ["1", "10.00", "0"],
      ["2", "5.50", "1.00"],
    ]);
  });

  it("parses simple CSV including quoted commas", () => {
    expect(parseLineGridClipboard('Widget, "1,000", 2\n')).toEqual([["Widget", "1,000", "2"]]);
  });

  it("returns empty for blank clipboard", () => {
    expect(parseLineGridClipboard("   \n")).toEqual([]);
  });
});
