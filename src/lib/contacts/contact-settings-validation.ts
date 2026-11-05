/** Validate contact defaults without silently altering values or overflowing PostgreSQL int4. */
const MAX_NEXT_ACCOUNT_NUMBER = 2_147_483_646;
export type ContactSettingsValues = {
  defaultKind: "customer" | "supplier" | "both";
  accountNumberPrefix: string;
  nextAccountNumber: number;
  defaultPaymentTermsDays: number;
};

export function normalizeContactSettingsValues(input: {
  defaultKind?: unknown;
  accountNumberPrefix?: unknown;
  nextAccountNumber?: unknown;
  defaultPaymentTermsDays?: unknown;
}): ContactSettingsValues {
  const defaultKind = input.defaultKind === undefined ? "customer" : input.defaultKind;
  if (defaultKind !== "customer" && defaultKind !== "supplier" && defaultKind !== "both") {
    throw new Error("Choose a valid default contact role.");
  }
  const rawPrefix = input.accountNumberPrefix === undefined ? "C" : input.accountNumberPrefix;
  if (typeof rawPrefix !== "string" || !rawPrefix.trim() || rawPrefix.trim().length > 10 ||
      /[\u0000-\u001f\u007f]/.test(rawPrefix)) {
    throw new Error("Account number prefix must be 1–10 characters without control characters.");
  }
  const nextAccountNumber = input.nextAccountNumber === undefined ? 1001 : input.nextAccountNumber;
  if (typeof nextAccountNumber !== "number" ||
      !Number.isSafeInteger(nextAccountNumber) ||
      nextAccountNumber < 1 || nextAccountNumber > MAX_NEXT_ACCOUNT_NUMBER) {
    throw new Error("Next account number must be a whole number from 1 to 2147483646.");
  }
  const defaultPaymentTermsDays =
    input.defaultPaymentTermsDays === undefined ? 30 : input.defaultPaymentTermsDays;
  if (typeof defaultPaymentTermsDays !== "number" ||
      !Number.isSafeInteger(defaultPaymentTermsDays) ||
      defaultPaymentTermsDays < 0 || defaultPaymentTermsDays > 3650) {
    throw new Error("Payment terms must be whole days from 0 to 3650.");
  }
  return {
    defaultKind,
    accountNumberPrefix: rawPrefix.trim(),
    nextAccountNumber,
    defaultPaymentTermsDays,
  };
}

export type ContactSettingsDraft = {
  defaultKind: string;
  prefix: string;
  nextNum: string;
  terms: string;
};

function parseWholeNumber(text: string, min: number, max: number): number | null {
  const value = text.trim();
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function parseContactSettingsDraft(draft: ContactSettingsDraft) {
  const errors: Record<string, string> = {};
  const nextAccountNumber = parseWholeNumber(draft.nextNum, 1, MAX_NEXT_ACCOUNT_NUMBER);
  const defaultPaymentTermsDays = parseWholeNumber(draft.terms, 0, 3650);
  if (!["customer", "supplier", "both"].includes(draft.defaultKind)) {
    errors["defaultKind"] = "Choose customer, supplier or both.";
  }
  if (!draft.prefix.trim() || draft.prefix.trim().length > 10 ||
      /[\u0000-\u001f\u007f]/.test(draft.prefix)) {
    errors["prefix"] = "Use 1–10 characters without control characters.";
  }
  if (nextAccountNumber === null) {
    errors["nextNum"] = "Enter a whole number between 1 and 2147483646.";
  }
  if (defaultPaymentTermsDays === null) {
    errors["terms"] = "Enter whole days between 0 and 3650.";
  }
  if (Object.keys(errors).length > 0 || nextAccountNumber === null ||
      defaultPaymentTermsDays === null) {
    return { ok: false as const, errors };
  }
  return {
    ok: true as const,
    errors: {},
    value: normalizeContactSettingsValues({
      defaultKind: draft.defaultKind,
      accountNumberPrefix: draft.prefix,
      nextAccountNumber,
      defaultPaymentTermsDays,
    }),
  };
}
