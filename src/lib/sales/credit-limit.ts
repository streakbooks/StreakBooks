/**
 * Customer credit-limit evaluation (sales AR honesty).
 *
 * Limit is stored on the contact as `credit_limit_minor` in the contact's default currency
 * (or company base when default is unset). Exposure is summed only for open invoices in that
 * same currency so multi-currency AR is never silently mixed. Mixed-currency books get an
 * informational "review" state instead of a false numeric breach.
 */

export type CreditLimitInvoice = {
  id: string;
  currencyCode: string;
  status: string;
  /** Invoice gross (tax-inclusive total). */
  totalMinor: number;
  amountPaidMinor: number;
  amountCreditedMinor: number;
};

export type CreditLimitAssessment = {
  /** null when no limit is configured (null/≤0). */
  limitMinor: number | null;
  currencyCode: string;
  /** Open AR in the limit currency, excluding the draft under review when provided. */
  existingExposureMinor: number;
  /** Draft/this invoice total included in proposed exposure when applicable. */
  proposedInvoiceMinor: number;
  proposedExposureMinor: number;
  overLimit: boolean;
  /** True when other open invoices exist in a different currency than the limit currency. */
  mixedCurrencyOpen: boolean;
  status: "ok" | "over_limit" | "mixed_currency_review" | "no_limit";
  message: string;
};

const OPEN = new Set(["authorised", "partly_paid"]);

export function invoiceOutstandingMinor(inv: CreditLimitInvoice): number {
  const paid = Math.max(0, Math.floor(Number(inv.amountPaidMinor) || 0));
  const credited = Math.max(0, Math.floor(Number(inv.amountCreditedMinor) || 0));
  const total = Math.max(0, Math.floor(Number(inv.totalMinor) || 0));
  return Math.max(0, total - paid - credited);
}

/**
 * Evaluate whether authorising / saving `candidate` would breach the contact credit limit.
 * `candidate` may be a draft (include its total) or an already-open invoice (exclude from
 * "existing" and re-add as proposed so edits do not double-count).
 */
export function assessCreditLimit(input: {
  creditLimitMinor: number | null | undefined;
  limitCurrencyCode: string;
  openInvoices: CreditLimitInvoice[];
  candidate: CreditLimitInvoice | null;
}): CreditLimitAssessment {
  const currencyCode = (input.limitCurrencyCode || "").trim().toUpperCase() || "XXX";
  const rawLimit = input.creditLimitMinor;
  const limitMinor =
    rawLimit == null || !Number.isFinite(Number(rawLimit)) || Number(rawLimit) <= 0
      ? null
      : Math.floor(Number(rawLimit));

  const others = input.openInvoices.filter((inv) =>
    input.candidate ? inv.id !== input.candidate.id : true,
  );
  const sameCurrency = others.filter(
    (inv) => OPEN.has(inv.status) && inv.currencyCode.toUpperCase() === currencyCode,
  );
  const otherCurrency = others.filter(
    (inv) => OPEN.has(inv.status) && inv.currencyCode.toUpperCase() !== currencyCode,
  );

  const existingExposureMinor = sameCurrency.reduce((s, inv) => s + invoiceOutstandingMinor(inv), 0);

  let proposedInvoiceMinor = 0;
  if (input.candidate) {
    const ccy = input.candidate.currencyCode.toUpperCase();
    if (ccy === currencyCode) {
      if (input.candidate.status === "draft" || !OPEN.has(input.candidate.status)) {
        proposedInvoiceMinor = Math.max(0, Math.floor(Number(input.candidate.totalMinor) || 0));
      } else {
        proposedInvoiceMinor = invoiceOutstandingMinor(input.candidate);
      }
    }
  }

  const proposedExposureMinor = existingExposureMinor + proposedInvoiceMinor;
  const mixedCurrencyOpen = otherCurrency.length > 0;

  if (limitMinor == null) {
    return {
      limitMinor: null,
      currencyCode,
      existingExposureMinor,
      proposedInvoiceMinor,
      proposedExposureMinor,
      overLimit: false,
      mixedCurrencyOpen,
      status: mixedCurrencyOpen ? "mixed_currency_review" : "no_limit",
      message: mixedCurrencyOpen
        ? "No credit limit is set. This customer also has open invoices in other currencies — review exposure manually."
        : "No credit limit is set for this customer.",
    };
  }

  const overLimit = proposedExposureMinor > limitMinor;
  if (mixedCurrencyOpen && !overLimit) {
    return {
      limitMinor,
      currencyCode,
      existingExposureMinor,
      proposedInvoiceMinor,
      proposedExposureMinor,
      overLimit: false,
      mixedCurrencyOpen: true,
      status: "mixed_currency_review",
      message: `Credit limit ${limitMinor} ${currencyCode} is not breached in ${currencyCode}, but open invoices exist in other currencies — review total exposure manually.`,
    };
  }

  if (overLimit) {
    return {
      limitMinor,
      currencyCode,
      existingExposureMinor,
      proposedInvoiceMinor,
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
    proposedInvoiceMinor,
    proposedExposureMinor,
    overLimit: false,
    mixedCurrencyOpen,
    status: "ok",
    message: `Within credit limit (${proposedExposureMinor} / ${limitMinor} ${currencyCode}).`,
  };
}
