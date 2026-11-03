export type LocalCharge = {
  id: string;
  providerId: string | null;
  currency: string;
  amountMinor: number | null;
};

export type ProviderCharge = {
  id: string;
  currency: string;
  amountMinor: number;
};

export type ProviderReconciliation = {
  providerCalled: false;
  state: "unrecorded" | "empty" | "match" | "mismatch";
  unmatchedLocal: string[];
  extraProvider: string[];
  differenceMinor: number | null;
};

/** Compare charges already in hand. A missing provider list is unrecorded, not zero. */
export function reconcileProviderCharges(input: {
  local: readonly LocalCharge[];
  provider: readonly ProviderCharge[] | null;
}): ProviderReconciliation {
  if (input.provider === null) {
    return {
      providerCalled: false,
      state: "unrecorded",
      unmatchedLocal: [],
      extraProvider: [],
      differenceMinor: null,
    };
  }
  if (input.local.length === 0 && input.provider.length === 0) {
    return {
      providerCalled: false,
      state: "empty",
      unmatchedLocal: [],
      extraProvider: [],
      differenceMinor: null,
    };
  }
  const provider = new Map(input.provider.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const unmatchedLocal: string[] = [];
  let differenceMinor: number | null = 0;
  let currency: string | null = null;
  for (const local of input.local) {
    const remote = local.providerId ? provider.get(local.providerId) : undefined;
    if (!remote || local.amountMinor === null) {
      unmatchedLocal.push(local.id);
      differenceMinor = null;
      continue;
    }
    seen.add(remote.id);
    if (!Number.isInteger(local.amountMinor) || !Number.isInteger(remote.amountMinor)) {
      throw new Error("Amounts must be whole minor units");
    }
    if (local.currency !== remote.currency) {
      unmatchedLocal.push(local.id);
      differenceMinor = null;
      continue;
    }
    if (currency === null) currency = local.currency;
    else if (currency !== local.currency) differenceMinor = null;
    if (differenceMinor !== null) differenceMinor += local.amountMinor - remote.amountMinor;
  }
  const extraProvider = input.provider.filter((row) => !seen.has(row.id)).map((row) => row.id);
  if (extraProvider.length > 0) differenceMinor = null;
  const state =
    unmatchedLocal.length === 0 && extraProvider.length === 0 && differenceMinor === 0
      ? "match"
      : "mismatch";
  return { providerCalled: false, state, unmatchedLocal, extraProvider, differenceMinor };
}
