/** Browser-local, schema-validated list filters. Never stores rows, financial values, tokens or arbitrary URLs. */
export type ViewValue = string | boolean | number;
export type ViewSnapshot = Record<string, ViewValue>;
export type ViewField =
  | { type: "text"; maxLength?: number }
  | { type: "choice"; choices: readonly string[] }
  | { type: "date" }
  | { type: "uuid" }
  | { type: "boolean" }
  | { type: "integer"; min: number; max: number };
export type ViewSchema = Readonly<Record<string, ViewField>>;
export type SavedWorkspaceView = { name: string; filters: ViewSnapshot };
export const MAX_SAVED_VIEWS = 8;
const MAX_VIEW_NAME = 48;
const MAX_STORAGE_LENGTH = 24_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export function normaliseViewName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_VIEW_NAME);
}

export function sanitiseViewSnapshot(input: unknown, schema: ViewSchema): ViewSnapshot {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const result: ViewSnapshot = {};
  for (const [key, rule] of Object.entries(schema)) {
    const value = raw[key];
    switch (rule.type) {
      case "text":
        if (typeof value === "string") result[key] = value.slice(0, rule.maxLength ?? 100);
        break;
      case "choice":
        if (typeof value === "string" && rule.choices.includes(value)) result[key] = value;
        break;
      case "date":
        if (
          value === "" ||
          (typeof value === "string" &&
            ISO_DATE.test(value) &&
            !Number.isNaN(Date.parse(value + "T00:00:00Z")))
        )
          result[key] = value;
        break;
      case "uuid":
        if (value === "" || (typeof value === "string" && UUID.test(value))) result[key] = value;
        break;
      case "boolean":
        if (typeof value === "boolean") result[key] = value;
        break;
      case "integer":
        if (
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= rule.min &&
          value <= rule.max
        )
          result[key] = value;
        break;
    }
  }
  return result;
}

export function parseSavedViews(raw: string | null, schema: ViewSchema): SavedWorkspaceView[] {
  if (!raw || raw.length > MAX_STORAGE_LENGTH) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const names = new Set<string>();
    const views: SavedWorkspaceView[] = [];
    for (const item of data.slice(0, 30)) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      if (typeof record["name"] !== "string") continue;
      const name = normaliseViewName(record["name"]);
      const canonical = name.toLocaleLowerCase();
      if (!name || names.has(canonical)) continue;
      names.add(canonical);
      views.push({ name, filters: sanitiseViewSnapshot(record["filters"], schema) });
      if (views.length === MAX_SAVED_VIEWS) break;
    }
    return views;
  } catch {
    return [];
  }
}

/** Saving the same name updates its filters; all other saved views remain in place. */
export function upsertSavedView(
  views: SavedWorkspaceView[],
  nameInput: string,
  snapshot: unknown,
  schema: ViewSchema,
): SavedWorkspaceView[] {
  const name = normaliseViewName(nameInput);
  if (!name) return views;
  const key = name.toLocaleLowerCase();
  const filtered = views.filter((view) => view.name.toLocaleLowerCase() !== key);
  return [...filtered, { name, filters: sanitiseViewSnapshot(snapshot, schema) }].slice(
    -MAX_SAVED_VIEWS,
  );
}

export function removeSavedView(views: SavedWorkspaceView[], name: string): SavedWorkspaceView[] {
  const key = name.toLocaleLowerCase();
  return views.filter((view) => view.name.toLocaleLowerCase() !== key);
}
