import type { ExpenseClaimLineInput } from "./claims";
import {
  allocateTaxAcrossLegs,
  splitExpenseAmount,
  type ExpenseSplitLegInput,
  type ExpenseSplitMethod,
} from "./split";

export type ExpenseDraftLineForm = {
  key: string;
  expenseDate: string;
  merchantName: string;
  description: string;
  accountId: string;
  netInput: string;
  taxInput: string;
  reimbursable: boolean;
  isBillable: boolean;
};

let draftKeySeq = 0;

export function newDraftLineKey(): string {
  draftKeySeq += 1;
  return `line-${draftKeySeq}`;
}

export function emptyDraftLine(expenseDate: string): ExpenseDraftLineForm {
  return {
    key: newDraftLineKey(),
    expenseDate,
    merchantName: "",
    description: "",
    accountId: "",
    netInput: "",
    taxInput: "0",
    reimbursable: true,
    isBillable: false,
  };
}

export function draftLinesFromClaim(
  lines: Array<{
    expenseDate: string;
    merchantName: string | null;
    description: string;
    accountId: string;
    netMinor: number;
    taxMinor: number;
  }>,
  currency: string,
  formatMinor: (minor: number, currency: string) => string,
): ExpenseDraftLineForm[] {
  if (lines.length === 0) return [emptyDraftLine(new Date().toISOString().slice(0, 10))];
  return lines.map((line) => ({
    key: newDraftLineKey(),
    expenseDate: line.expenseDate,
    merchantName: line.merchantName ?? "",
    description: line.description,
    accountId: line.accountId,
    netInput: formatMinor(line.netMinor, currency),
    taxInput: formatMinor(line.taxMinor, currency),
    reimbursable: true,
    isBillable: false,
  }));
}

export function toClaimLineInputs(
  lines: readonly ExpenseDraftLineForm[],
  currency: string,
  parseMinor: (value: string, label: string) => number,
): ExpenseClaimLineInput[] {
  return lines.map((line) => {
    const netMinor = parseMinor(line.netInput, "Net amount");
    const taxMinor = parseMinor(line.taxInput || "0", "Tax amount");
    const grossMinor = netMinor + taxMinor;
    return {
      expenseDate: line.expenseDate,
      merchantName: line.merchantName.trim() || undefined,
      description: line.description.trim(),
      accountId: line.accountId,
      netMinor,
      taxMinor,
      grossMinor,
      currencyCode: currency,
      reimbursableMinor: line.reimbursable ? grossMinor : 0,
      nonReimbursableMinor: line.reimbursable ? 0 : grossMinor,
      isBillable: line.isBillable,
    };
  });
}

/**
 * Replace one draft line with N allocation lines that preserve net+tax totals.
 * Each resulting leg needs its own accountId supplied by the caller.
 */
export function splitDraftLine(
  line: ExpenseDraftLineForm,
  method: ExpenseSplitMethod,
  legs: readonly (ExpenseSplitLegInput & { accountId: string; description?: string })[],
  currency: string,
  parseMinor: (value: string, label: string) => number,
  formatMinor: (minor: number, currency: string) => string,
): { ok: true; lines: ExpenseDraftLineForm[] } | { ok: false; error: string } {
  const netMinor = parseMinor(line.netInput, "Net amount");
  const taxMinor = parseMinor(line.taxInput || "0", "Tax amount");
  const split = splitExpenseAmount(netMinor, method, legs);
  if (!split.ok) return split;

  const taxes = allocateTaxAcrossLegs(
    taxMinor,
    split.legs.map((leg) => leg.amountMinor),
  );
  if ("error" in taxes) return { ok: false, error: taxes.error };

  return {
    ok: true,
    lines: split.legs.map((leg, index) => ({
      key: newDraftLineKey(),
      expenseDate: line.expenseDate,
      merchantName: line.merchantName,
      description:
        legs[index]?.description?.trim() ||
        `${line.description.trim() || "Expense"} (${leg.label})`,
      accountId: legs[index]?.accountId ?? "",
      netInput: formatMinor(leg.amountMinor, currency),
      taxInput: formatMinor(taxes[index] ?? 0, currency),
      reimbursable: line.reimbursable,
      isBillable: line.isBillable,
    })),
  };
}
