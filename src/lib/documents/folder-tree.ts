/** Pure helpers for a company-scoped document folder tree. */
export type DocumentFolder = { id: string; name: string; parent_id: string | null };
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export function validateFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120 || hasControlCharacter(trimmed))
    throw new Error("Folder name must contain 1–120 printable characters");
  return trimmed;
}
export function folderAncestors(
  folders: readonly DocumentFolder[],
  folderId: string | null,
): DocumentFolder[] {
  const lookup = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<string>();
  const ancestors: DocumentFolder[] = [];
  let current = folderId;
  while (current && lookup.has(current) && !seen.has(current)) {
    seen.add(current);
    const folder = lookup.get(current)!;
    ancestors.unshift(folder);
    current = folder.parent_id;
  }
  return ancestors;
}
export function possibleParentFolders(
  folders: readonly DocumentFolder[],
  folderId: string,
): DocumentFolder[] {
  const forbidden = new Set([folderId]);
  let previousSize = -1;
  while (previousSize !== forbidden.size) {
    previousSize = forbidden.size;
    for (const folder of folders)
      if (folder.parent_id && forbidden.has(folder.parent_id)) forbidden.add(folder.id);
  }
  return folders.filter((folder) => !forbidden.has(folder.id));
}

/** Label destinations by their full path so similarly named nested folders are distinguishable. */
export function folderDisplayPath(folders: readonly DocumentFolder[], folderId: string): string {
  return folderAncestors(folders, folderId)
    .map((folder) => folder.name)
    .join(" / ");
}

/**
 * Resolve a folder and every nested descendant for organisation-scoped searches.
 * The server must first load the bounded, company-filtered folder list.
 * Cycles are ignored (they cannot be introduced through the normal DB trigger).
 */
export function folderDescendantIds(
  folders: readonly Pick<DocumentFolder, "id" | "parent_id">[],
  rootId: string,
): string[] {
  if (!folders.some((folder) => folder.id === rootId)) return [];
  const byParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parent_id) continue;
    const children = byParent.get(folder.parent_id) ?? [];
    children.push(folder.id);
    byParent.set(folder.parent_id, children);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  const pending = [rootId];
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index]!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    pending.push(...(byParent.get(id) ?? []));
  }
  return ids;
}

/**
 * Index display paths once per folder query. Building a path via ancestor scans
 * for each search candidate causes O(n²) work on large folder trees.
 * Missing parents and malformed cycles are safely truncated.
 */
export function indexFolderPaths(folders: readonly DocumentFolder[]): ReadonlyMap<string, string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const cache = new Map<string, string>();

  const visit = (id: string, visiting: Set<string>): string => {
    if (cache.has(id)) return cache.get(id)!;
    const folder = byId.get(id);
    if (!folder || visiting.has(id)) return "";
    visiting.add(id);
    const parentPath = folder.parent_id ? visit(folder.parent_id, visiting) : "";
    visiting.delete(id);
    const result = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    cache.set(id, result);
    return result;
  };
  for (const folder of folders) visit(folder.id, new Set<string>());
  return cache;
}
