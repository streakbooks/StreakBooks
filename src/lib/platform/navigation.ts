import { z } from "zod";
import { sectionSchema, type Section, type Row } from "./catalog";
export const recordResourceSchema = z.enum(["businesses", "users", "firms"]);
export type RecordResource = z.infer<typeof recordResourceSchema>;
export const searchHitSchema = z.object({
  kind: z.enum(["business", "user", "firm"]),
  id: z.string().uuid(),
  label: z.string().min(1),
});
export type PlatformSearchHit = z.infer<typeof searchHitSchema>;
export const platformSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .max(160)
    .refine((value) => Array.from(value).length >= 2, "Enter at least two characters"),
});
export const platformRecordSchema = z.object({
  resource: recordResourceSchema,
  id: z.string().uuid(),
});
export type PlatformRecord = { record: Row; related: Row };
export function recordResource(value: string): RecordResource | undefined {
  const result = recordResourceSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
export function parsePlatformSearch(raw: Record<string, unknown>): {
  section: Section;
  record?: string | undefined;
} {
  const section = sectionSchema.catch("overview").parse(raw["section"]);
  const id = z.string().uuid().safeParse(raw["record"]);
  // TanStack merges validated search with the raw URL. Explicitly clear rejected IDs.
  return { section, record: recordResource(section) && id.success ? id.data : undefined };
}
export function searchDestination(hit: PlatformSearchHit): {
  section: RecordResource;
  record: string;
} {
  return {
    section: hit.kind === "business" ? "businesses" : hit.kind === "user" ? "users" : "firms",
    record: hit.id,
  };
}

export function recordReference(
  column: string,
  value: unknown,
  permissions: readonly string[],
): { section: RecordResource; record: string } | undefined {
  const section =
    column === "company_id"
      ? "businesses"
      : column === "user_id"
        ? "users"
        : column === "firm_id"
          ? "firms"
          : undefined;
  const id = z.string().uuid().safeParse(value);
  return section && id.success && permissions.includes(`${section}.view`)
    ? { section, record: id.data }
    : undefined;
}
