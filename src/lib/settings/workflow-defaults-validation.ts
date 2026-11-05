/** Keep empty or malformed payment terms out of organisation-wide settings. */
export function parsePaymentTermsDays(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return Number.isSafeInteger(days) && days >= 0 && days <= 3650 ? days : null;
}

/** Server-side validation shared by Sales, Purchases and Automation settings. */
export function parseWorkflowWholeDays(
  value: unknown,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return defaultValue;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`Enter whole days between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function parseWorkflowBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error("Invalid workflow setting boolean");
  return value;
}

export function parseWorkflowText(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > 2000) {
    throw new Error("Invalid workflow setting text (maximum 2,000 characters)");
  }
  return value.trim() || null;
}

export function parseWorkflowCsvDateFormat(value: unknown): string {
  if (value === undefined) return "YYYY-MM-DD";
  if (value !== "YYYY-MM-DD" && value !== "DD/MM/YYYY" && value !== "MM/DD/YYYY") {
    throw new Error("Invalid banking CSV date format");
  }
  return value;
}
