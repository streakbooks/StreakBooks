import { isReportDate } from "./date-validation";
import { customDefinitionSchema, type CustomDefinition } from "./custom-definition";
import { z } from "zod";
import { getReportById } from "./catalog";
import { parseReportSearch, type ReportSearch } from "./search";

export const savedReportName = z.string().trim().min(1, "Report name is required.").max(80);
export const reportLibraryMetadata = z.object({
  archived: z.boolean().default(false),
  template: z.boolean().default(false),
  description: z.string().trim().max(1000).default(""),
});
export type LibraryMetadata = z.infer<typeof reportLibraryMetadata>;
export type SavedReport = {
  id: string;
  report_id: string;
  name: string;
  user_id: string;
  modified_by?: string;
  access_level?: "private" | "selected" | "company" | "firm";
  firm_id?: string | null;
  version?: number;
  is_favourite: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export function libraryMetadata(config: Record<string, unknown>): LibraryMetadata {
  const parsed = reportLibraryMetadata.safeParse(config["_library"] ?? {});
  return parsed.success ? parsed.data : { archived: false, template: false, description: "" };
}

/** Only supported URL filters are persisted; executable expressions are never accepted. */
export function validateSavedConfig(
  raw: Record<string, unknown>,
): ReportSearch & { _builder?: CustomDefinition } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid report configuration.");
  if (JSON.stringify(raw).length > 100000) throw new Error("Report configuration is too large.");
  const config = parseReportSearch(raw);
  for (const key of ["from", "to"] as const) {
    if (raw[key] !== undefined && raw[key] !== "") {
      const date = config[key];
      if (!isReportDate(date)) {
        throw new Error(`Invalid ${key} date.`);
      }
    }
  }
  if (config["from"] && config["to"] && config["from"] > config["to"])
    throw new Error("End date must follow start date.");
  // A saved view must open at the first page, rather than an arbitrary stale offset.
  delete config.page;
  return raw["_builder"]
    ? { ...config, _builder: customDefinitionSchema.parse(raw["_builder"]) }
    : config;
}

export function assertRunnableReport(id: string): string {
  const report = getReportById(id);
  if (
    !report ||
    report.status !== "ready" ||
    report.runner === "link" ||
    report.runner === "none"
  ) {
    throw new Error("Choose an available financial report.");
  }
  return id;
}

/** The library name is also the title used by the advanced renderer. */
export function namedSavedConfig(raw: Record<string, unknown>, name: string) {
  const config = validateSavedConfig(raw);
  return config._builder
    ? { ...config, _builder: { ...config._builder, title: savedReportName.parse(name) } }
    : config;
}
