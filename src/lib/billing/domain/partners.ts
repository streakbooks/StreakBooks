/**
 * Partner programme rules shared by the UI and tests. The database computes and stores commission;
 * these mirrors only preview it and normalise customer input.
 */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{6,24}$/;
export const REFERRAL_STORAGE_KEY = "linkbooks.referralCode";

export function normaliseReferralCode(input: string | null | undefined): string | null {
  const code = (input ?? "").trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export function referralLink(origin: string, code: string): string {
  const url = new URL("/pricing", origin);
  url.searchParams.set("ref", code);
  return url.toString();
}

/** The server-side brake: payouts also need the database flag approved by a second owner. */
export function partnerPayoutsSwitchOn(env: Record<string, string | undefined>): boolean {
  return (env["PARTNER_PAYOUTS_ENABLED"] ?? "").trim().toLowerCase() === "true";
}

export type CommissionRuleTerms =
  | { kind: "percent"; percentBps: number }
  | { kind: "fixed"; fixedMinor: bigint; fixedCurrency: string };

/** Net eligible revenue is the invoice subtotal after discounts, excluding tax. */
export function commissionFor(
  basisMinor: bigint,
  currency: string,
  rule: CommissionRuleTerms,
): bigint {
  if (basisMinor <= 0n) return 0n;
  if (rule.kind === "percent") return (basisMinor * BigInt(rule.percentBps)) / 10000n;
  if (rule.fixedCurrency !== currency) return 0n;
  return rule.fixedMinor < basisMinor ? rule.fixedMinor : basisMinor;
}

/** Proportional reversal for a credit note; the final credit reverses whatever remains. */
export function commissionReversal(input: {
  accrualMinor: bigint;
  remainingMinor: bigint;
  creditMinor: bigint;
  invoiceTotalMinor: bigint;
  creditedToDateMinor: bigint;
}): bigint {
  if (input.remainingMinor <= 0n) return 0n;
  if (input.invoiceTotalMinor <= 0n || input.creditedToDateMinor >= input.invoiceTotalMinor) {
    return input.remainingMinor;
  }
  const numerator = input.accrualMinor * input.creditMinor;
  let share = numerator / input.invoiceTotalMinor;
  if (2n * (numerator - share * input.invoiceTotalMinor) >= input.invoiceTotalMinor) share += 1n;
  return share < input.remainingMinor ? share : input.remainingMinor;
}
