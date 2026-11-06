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
export function folderDisplayPath(
  folders: readonly DocumentFolder[],
  folderId: string,
): string {
  return folderAncestors(folders, folderId).map((folder) => folder.name).join(" / ");
}
