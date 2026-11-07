/**
 * A contact detail can carry only the originating directory role/view.
 * Never accept a user-supplied path as a return destination.
 */
export const CONTACT_DIRECTORY_VIEWS = [
  "all",
  "customers",
  "suppliers",
  "both",
  "recent",
  "updated",
  "inactive",
  "archived",
] as const;

export type ContactDirectoryView = (typeof CONTACT_DIRECTORY_VIEWS)[number];

/** Invalid/untrusted query values intentionally return undefined. */
export function parseContactDirectoryView(value: unknown): ContactDirectoryView | undefined {
  return typeof value === "string" &&
    (CONTACT_DIRECTORY_VIEWS as readonly string[]).includes(value)
    ? (value as ContactDirectoryView)
    : undefined;
}
