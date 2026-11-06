/**
 * Fail-closed conversion of PostgreSQL BIGINT / PostgREST integer amounts
 * into the UI's number-based minor-unit model.
 *
 * The source may be a decimal string, safe integer number or bigint.
 * Reject non-integers, null, unsigned overflow and silent Number() rounding
 * rather than showing a plausible but incorrect monetary figure.
 *
 * Exact amounts larger than JS safe integer must be handled by BigInt/string
 * reports, not coerced into this UI model.
 */
export function safeAssetMinorNumber(
  raw: unknown,
  label: string,
  { minimum = 0 }: { minimum?: number } = {},
): number {
  if (!Number.isSafeInteger(minimum) || minimum < 0) {
    throw new Error("Invalid minor-unit minimum.");
  }
  let exact: bigint;
  if (typeof raw === "bigint") {
    exact = raw;
  } else if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw)) {
      throw new Error(label + " has lost minor-unit precision.");
    }
    exact = BigInt(raw);
  } else if (typeof raw === "string" && /^-?\d+$/.test(raw)) {
    exact = BigInt(raw);
  } else {
    throw new Error(label + " must be an exact whole minor-unit amount.");
  }
  if (exact < BigInt(minimum)) {
    throw new Error(label + " must be at least " + minimum + " minor units.");
  }
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(label + " exceeds safe minor-unit precision.");
  }
  return Number(exact);
}

/** Nullable fields must be genuinely null, not missing or malformed. */
export function nullableAssetMinorNumber(raw: unknown, label: string): number | null {
  if (raw === null) return null;
  return safeAssetMinorNumber(raw, label);
}
