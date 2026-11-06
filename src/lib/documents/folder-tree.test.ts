import { describe, expect, it } from "vitest";
import { folderAncestors, folderDisplayPath, possibleParentFolders, validateFolderName } from "./folder-tree";
const folders = [
  { id: "a", name: "Root", parent_id: null },
  { id: "b", name: "Bills", parent_id: "a" },
  { id: "c", name: "2026", parent_id: "b" },
  { id: "d", name: "Other", parent_id: null },
];
describe("folder-tree", () => {
  it("validates names and trims whitespace", () => {
    expect(validateFolderName("  Bills  ")).toBe("Bills");
    expect(() => validateFolderName("   ")).toThrow();
    expect(() => validateFolderName("x".repeat(121))).toThrow();
    expect(() => validateFolderName("bad\nname")).toThrow();
  });
  it("builds ordered breadcrumbs", () => {
    expect(folderAncestors(folders, "c").map((f) => f.name)).toEqual(["Root", "Bills", "2026"]);
    expect(folderAncestors(folders, null)).toEqual([]);
  });
  it("labels same-named nested destinations by their complete path", () => {
    expect(folderDisplayPath(folders, "c")).toBe("Root / Bills / 2026");
    expect(folderDisplayPath(folders, "d")).toBe("Other");
    expect(folderDisplayPath(folders, "unknown")).toBe("");
  });
  it("excludes self and descendants as move destinations", () => {
    expect(possibleParentFolders(folders, "b").map((f) => f.id)).toEqual(["a", "d"]);
  });
  it("terminates safely on malformed cycles", () => {
    expect(
      folderAncestors(
        [
          { id: "a", name: "A", parent_id: "b" },
          { id: "b", name: "B", parent_id: "a" },
        ],
        "a",
      ),
    ).toHaveLength(2);
  });
});
