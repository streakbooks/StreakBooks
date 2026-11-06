/** Exact payroll salary-line amount and percentage parsing.
 * Mirrors the current PostgreSQL payroll salary line limits.
 */
import { decimalPlacesFor, toMinorUnits } from "@/lib/accounting/money";

export const PAYROLL_SALARY_MAX_MINOR = 900_000_000_000_000n;
export const PAYROLL_PERCENT_MAX_BPS = 1_000_000n;

/** Do not silently round employee salary structures or hourly rates. */
export function parsePayrollSalaryMinor(
  input: string,
  currency: string,
  field: string,
): bigint {
  const value = input.trim() || "0";
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(`${field} must be a non-negative decimal amount.`);
  }
  const decimals = decimalPlacesFor(currency);
  const fractional = value.split(".")[1] ?? "";
  if (fractional.length > decimals) {
    throw new Error(`${field} allows at most ${decimals} decimal places for ${currency}.`);
  }
  const minor = toMinorUnits(value, currency);
  if (minor > PAYROLL_SALARY_MAX_MINOR) {
    throw new Error(`${field} exceeds the payroll salary line limit.`);
  }
  return minor;
}

/** A percentage basis point is 0.01%; never round malformed/invalid values to zero. */
export function parsePayrollPercentageBps(input: string): number {
  const value = input.trim() || "0";
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Percentage must be non-negative with no more than two decimal places.");
  }
  const [whole, fractional = ""] = value.split(".");
  const basisPoints = BigInt(whole!) * 100n + BigInt(fractional.padEnd(2, "0") || "0");
  if (basisPoints > PAYROLL_PERCENT_MAX_BPS) {
    throw new Error("Percentage exceeds the payroll limit of 10,000%.");
  }
  return Number(basisPoints);
}
