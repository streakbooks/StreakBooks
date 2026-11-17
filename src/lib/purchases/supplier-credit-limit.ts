/**
 * Supplier credit-limit evaluation (purchases AP honesty).
 *
 * Uses the same contact `credit_limit_minor` field as sales AR. Exposure is summed only for
 * open bills in the contact's default currency (or company base when unset) so multi-currency
 * AP is never silently mixed. Mixed-currency books get an informational "review" state instead
 * of a false numeric breach.
 */

export type SupplierCreditLimitBill = {
  id: string;
  currencyCode: string;
  status: string;
  /** Bill gross (tax-inclusive total). */
  totalMinor: number;
  amountPaidMinor: number;
  amountCreditedMinor: number;
};

export type SupplierCreditLimitAssessment = {
  /** null when no limit is configured (null/≤0). */
  limitMinor: number | null;
  currencyCode: string;
  /** Open AP in the limit currency, excluding the draft under review when provided. */
  existingExposureMinor: number;
  /** Draft/this bill total included in proposed exposure when applicable. */
  proposedBillMinor: number;
  proposedExposureMinor: number;
  overLimit: boolean;
  /** True when other open bills exist in a different currency than the limit currency. */
  mixedCurrencyOpen: boolean;
  status: "ok" | "over_limit" | "mixed_currency_review" | "no_limit";
  message: string;
};

const OPEN = new Set(["authorised", "partly_paid"]);

export function billOutstandingMinor(bill: SupplierCreditLimitBill): number {
  const paid = Math.max(0, Math.floor(Number(bill.amountPaidMinor) || 0));
  const credited = Math.max(0, Math.floor(Number(bill.amountCreditedMinor) || 0));
  const total = Math.max(0, Math.floor(Number(bill.totalMinor) || 0));
  return Math.max(0, total - paid - credited);
}

/**
 * Evaluate whether authorising / saving `candidate` would breach the supplier credit limit.
 * `candidate` may be a draft (include its total) or an already-open bill (exclude from
 * "existing" and re-add as proposed so edits do not double-count).
 */
export function assessSupplierCreditLimit(input: {
  creditLimitMinor: number | null | undefined;
  limitCurrencyCode: string;
  openBills: SupplierCreditLimitBill[];
  candidate: SupplierCreditLimitBill | null;
}): SupplierCreditLimitAssessment {
  const currencyCode = (input.limitCurrencyCode || "").trim().toUpperCase() || "XXX";
  const rawLimit = input.creditLimitMinor;
  const limitMinor =
    rawLimit == null || !Number.isFinite(Number(rawLimit)) || Number(rawLimit) <= 0
      ? null
      : Math.floor(Number(rawLimit));

  const others = input.openBills.filter((bill) =>
    input.candidate ? bill.id !== input.candidate.id : true,
  );
  const sameCurrency = others.filter(
    (bill) => OPEN.has(bill.status) && bill.currencyCode.toUpperCase() === currencyCode,
  );
  const otherCurrency = others.filter(
    (bill) => OPEN.has(bill.status) && bill.currencyCode.toUpperCase() !== currencyCode,
  );

  const existingExposureMinor = sameCurrency.reduce((s, bill) => s + billOutstandingMinor(bill), 0);

  let proposedBillMinor = 0;
  if (input.candidate) {
    const ccy = input.candidate.currencyCode.toUpperCase();
    if (ccy === currencyCode) {
      if (
        input.candidate.status === "draft" ||
        input.candidate.status === "awaiting_approval" ||
        !OPEN.has(input.candidate.status)
      ) {
        proposedBillMinor = Math.max(0, Math.floor(Number(input.candidate.totalMinor) || 0));
      } else {
        proposedBillMinor = billOutstandingMinor(input.candidate);
      }
    }
  }

  const proposedExposureMinor = existingExposureMinor + proposedBillMinor;
  const mixedCurrencyOpen = otherCurrency.length > 0;

  if (limitMinor == null) {
    return {
      limitMinor: null,
      currencyCode,
      existingExposureMinor,
      proposedBillMinor,
      proposedExposureMinor,
      overLimit: false,
      mixedCurrencyOpen,
      status: mixedCurrencyOpen ? "mixed_currency_review" : "no_limit",
      message: mixedCurrencyOpen
        ? "No credit limit is set. This supplier also has open bills in other currencies — review exposure manually."
        : "No credit limit is set for this supplier.",
    };
  }

  const overLimit = proposedExposureMinor > limitMinor;
  if (mixedCurrencyOpen && !overLimit) {
    return {
      limitMinor,
      currencyCode,
      existingExposureMinor,
      proposedBillMinor,
      proposedExposureMinor,
      overLimit: false,
      mixedCurrencyOpen: true,
      status: "mixed_currency_review",
      message: `Credit limit ${limitMinor} ${currencyCode} is not breached in ${currencyCode}, but open bills exist in other currencies — review total exposure manually.`,
    };
  }

  if (overLimit) {
    return {
      limitMinor,
      currencyCode,
      existingExposureMinor,
      proposedBillMinor,
      proposedExposureMinor,
      overLimit: true,
      mixedCurrencyOpen,
      status: "over_limit",
      message: `Proposed exposure ${proposedExposureMinor} exceeds credit limit ${limitMinor} ${currencyCode}. Acknowledge to authorise anyway.`,
    };
  }

  return {
    limitMinor,
    currencyCode,
    existingExposureMinor,
    proposedBillMinor,
    proposedExposureMinor,
    overLimit: false,
    mixedCurrencyOpen,
    status: "ok",
    message: `Within credit limit (${proposedExposureMinor} / ${limitMinor} ${currencyCode}).`,
  };
}
