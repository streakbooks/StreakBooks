export type LegacyExpenseMigrationPreview = {
  pendingCount: number;
  alreadyImportedCount: number;
  sample: Array<{
    id: string;
    claimDate: string;
    description: string;
    amountMinor: number;
    currencyCode: string;
    status: string;
    claimantUserId: string;
  }>;
};

export type LegacyExpenseMigrationResult = {
  importedCount: number;
  skippedCount: number;
  limit: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function mapLegacyExpenseMigrationPreview(row: unknown): LegacyExpenseMigrationPreview {
  const r = asRecord(row);
  const sample = Array.isArray(r["sample"]) ? r["sample"] : [];
  return {
    pendingCount: num(r["pending_count"] ?? r["pendingCount"]),
    alreadyImportedCount: num(r["already_imported_count"] ?? r["alreadyImportedCount"]),
    sample: sample.map((item) => {
      const s = asRecord(item);
      return {
        id: str(s["id"]),
        claimDate: str(s["claim_date"] ?? s["claimDate"]),
        description: str(s["description"]),
        amountMinor: num(s["amount_minor"] ?? s["amountMinor"]),
        currencyCode: str(s["currency_code"] ?? s["currencyCode"]).toUpperCase(),
        status: str(s["status"]),
        claimantUserId: str(s["claimant_user_id"] ?? s["claimantUserId"]),
      };
    }),
  };
}

export function mapLegacyExpenseMigrationResult(row: unknown): LegacyExpenseMigrationResult {
  const r = asRecord(row);
  return {
    importedCount: num(r["imported_count"] ?? r["importedCount"]),
    skippedCount: num(r["skipped_count"] ?? r["skippedCount"]),
    limit: num(r["limit"]),
  };
}

/** Human-readable summary for settings UI after an import batch. */
export function formatLegacyImportSummary(result: LegacyExpenseMigrationResult): string {
  if (result.importedCount === 0 && result.skippedCount === 0) {
    return "No legacy claims left to import.";
  }
  const parts = [`Imported ${result.importedCount} draft claim(s)`];
  if (result.skippedCount > 0) {
    parts.push(`skipped ${result.skippedCount} already-linked row(s)`);
  }
  return `${parts.join("; ")}.`;
}
