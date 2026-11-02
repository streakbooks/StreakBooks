export type StoredAmount =
  { status: "unavailable"; minor: null } | { status: "stored"; minor: number };

function storedAmount(value: number | null, label: string): StoredAmount {
  if (value == null) return { status: "unavailable", minor: null };
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer of minor units.`);
  return { status: "stored", minor: value };
}

/** A missing fee is not zero. Net revenue is gross minus a stored fee. */
export function netRevenueMinor(grossMinor: number | null, feeMinor: number | null): StoredAmount {
  if (grossMinor == null || feeMinor == null) return { status: "unavailable", minor: null };
  const gross = storedAmount(grossMinor, "Gross");
  const fee = storedAmount(feeMinor, "Fee");
  if (gross.status !== "stored" || fee.status !== "stored")
    return { status: "unavailable", minor: null };
  return { status: "stored", minor: gross.minor - fee.minor };
}

/** Lifetime value is only a stored figure. A missing history is not zero. */
export function lifetimeValueMinor(storedMinor: number | null): StoredAmount {
  return storedAmount(storedMinor, "Lifetime value");
}
