/** Parse journal/return minor-unit money without rounding or IEEE-754 loss. */
export function exactTaxMinorUnits(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an exact minor-unit integer.`);
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  throw new Error(`${label} must be an exact minor-unit integer.`);
}

export function safeTaxMinorNumber(value: unknown, label: string): number {
  const exact = exactTaxMinorUnits(value, label);
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (exact > max || exact < -max) {
    throw new Error(`${label} is too large for the current tax report display.`);
  }
  return Number(exact);
}
