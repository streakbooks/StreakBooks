/** Consume prepaid sessions without driving the balance or the liability negative. */

export type SessionBalance = {
  remaining: number;
  liabilityMinor: number;
};

export function consumeSessions(
  balance: SessionBalance,
  count: number,
): SessionBalance & { recognisedMinor: number } {
  if (!Number.isSafeInteger(balance.remaining) || balance.remaining < 0) {
    throw new Error("Session balance is invalid");
  }
  if (!Number.isSafeInteger(balance.liabilityMinor) || balance.liabilityMinor < 0) {
    throw new Error("Session liability is invalid");
  }
  if (!Number.isSafeInteger(count) || count <= 0)
    throw new Error("Consumption count must be positive");
  if (count > balance.remaining) throw new Error("Not enough sessions remaining");
  if (balance.remaining === 0) throw new Error("Not enough sessions remaining");
  const base = Math.floor(balance.liabilityMinor / balance.remaining);
  const recognisedMinor = count === balance.remaining ? balance.liabilityMinor : base * count;
  return {
    remaining: balance.remaining - count,
    liabilityMinor: balance.liabilityMinor - recognisedMinor,
    recognisedMinor,
  };
}
