import { describe, expect, it } from "vitest";
import {
  folderAncestors,
  folderDescendantIds,
  folderDisplayPath,
  indexFolderPaths,
  possibleParentFolders,
  validateFolderName,
} from "./folder-tree";
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
  it("indexes distinct, complete nested paths for efficient search without rerunning ancestors", () => {
    const paths = indexFolderPaths(folders);
    expect(paths.get("a")).toBe("Root");
    expect(paths.get("b")).toBe("Root / Bills");
    expect(paths.get("c")).toBe("Root / Bills / 2026");
    expect(paths.get("d")).toBe("Other");
    expect(paths.has("not-found")).toBe(false);
  });
  it("bounds corrupt cycles and missing parents without hanging", () => {
    const paths = indexFolderPaths([
      { id: "a", name: "A", parent_id: "b" },
      { id: "b", name: "B", parent_id: "a" },
      { id: "orphan", name: "Orphan", parent_id: "unknown" },
    ]);
    expect(paths.get("a")).toContain("A");
    expect(paths.get("b")).toContain("B");
    expect(paths.get("orphan")).toBe("Orphan");
  });
  it("includes the selected folder and nested descendants but not siblings", () => {
    expect(folderDescendantIds(folders, "a")).toEqual(["a", "b", "c"]);
    expect(folderDescendantIds(folders, "b")).toEqual(["b", "c"]);
    expect(folderDescendantIds(folders, "d")).toEqual(["d"]);
    expect(folderDescendantIds(folders, "unknown")).toEqual([]);
  });
  it("handles malformed folder cycles without repeating ids", () => {
    expect(
      folderDescendantIds(
        [
          { id: "a", parent_id: "b" },
          { id: "b", parent_id: "a" },
          { id: "c", parent_id: "b" },
        ],
        "a",
      ),
    ).toEqual(["a", "b", "c"]);
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
