export type AccountingBasis = "accrual" | "cash";

/** Reject invalid overrides instead of silently serving another accounting method. */
export function parseAccountingBasis(value: unknown): AccountingBasis | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "accrual" || value === "cash") return value;
  throw new Error("Choose cash or accrual accounting basis");
}

/** Read saved overrides before schemas fill in their legacy accrual default. */
export function savedReportBasis(config: Record<string, unknown>): AccountingBasis | undefined {
  const builder = config["_builder"];
  if (builder && typeof builder === "object" && !Array.isArray(builder)) {
    const basis = parseAccountingBasis((builder as Record<string, unknown>)["basis"]);
    if (basis) return basis;
  }
  const basis = parseAccountingBasis(config["basis"]);
  if (basis) return basis;
  if (typeof config["settings"] === "string") {
    const settings = JSON.parse(config["settings"]) as Record<string, unknown>;
    return parseAccountingBasis(settings?.["basis"]);
  }
  return undefined;
}

/** Freeze the effective method on a new capture without changing the saved view. */
export function withSavedReportBasis(
  config: Record<string, unknown>,
  defaultBasis: AccountingBasis,
): Record<string, unknown> {
  const basis = savedReportBasis(config) ?? defaultBasis;
  const frozen: Record<string, unknown> = { ...config, basis };
  const builder = config["_builder"];
  if (builder && typeof builder === "object" && !Array.isArray(builder)) {
    frozen["_builder"] = { ...builder, basis };
  }
  if (typeof config["settings"] === "string") {
    frozen["settings"] = JSON.stringify({ ...JSON.parse(config["settings"]), basis });
  }
  return frozen;
}
