export type AllowanceLevel = "ok" | "warn" | "block";

/** Warn at 80% of a numeric cap. Block at 100%. A null cap is unlimited. */
export function allowanceLevel(used: number, limit: number | null, adding = 0): AllowanceLevel {
  if (limit == null) return "ok";
  if (!Number.isFinite(used) || !Number.isFinite(adding) || limit < 0) return "block";
  const next = used + adding;
  if (next > limit) return "block";
  if (limit === 0) return next > 0 ? "block" : "ok";
  if (next / limit >= 0.8) return "warn";
  return "ok";
}

export function upgradeMessage(metric: string, limit: number | null): string {
  const cap = limit == null ? "this plan's" : String(limit);
  return `The ${metric.replaceAll("_", " ")} limit of ${cap} is reached. Open Subscription to upgrade. Existing records stay available.`;
}
