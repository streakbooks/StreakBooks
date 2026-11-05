import { currencies as supportedCurrencies } from "@/lib/company-constants";

const supported = new Set<string>(supportedCurrencies);

/**
 * Reject malformed input instead of silently dropping currencies from a
 * replacement request. Existing legacy codes are permitted in the expected
 * snapshot so users can remove them without adding them back.
 */
export function normalizeCurrencySelection(
  input: unknown,
  options: { enforceSupported?: boolean } = {},
): string[] {
  if (!Array.isArray(input) || input.length > 80) {
    throw new Error("Currency selection must be a list of at most 80 codes.");
  }

  const codes: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") {
      throw new Error("Currency codes must be text.");
    }
    const code = value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new Error("Currency codes must contain exactly three letters.");
    }
    if (options.enforceSupported && !supported.has(code)) {
      throw new Error(`Currency ${code} is not supported by the current currency selector.`);
    }
    codes.push(code);
  }

  return [...new Set(codes)].sort();
}
