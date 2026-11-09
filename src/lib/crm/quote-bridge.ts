import type { SalesLineInput } from "@/lib/sales/line-helpers";

export function buildOpportunityQuoteLine(input: {
  opportunityName: string;
  opportunityNumber: string;
  amountMinor: number;
  accountId: string;
}): SalesLineInput {
  const amount = Math.max(0, Math.trunc(input.amountMinor));
  return {
    description: `${input.opportunityNumber} — ${input.opportunityName}`.slice(0, 200),
    accountId: input.accountId,
    quantity: 1,
    unitPriceMinor: amount,
    discountMinor: 0,
    taxRateBps: 0,
  };
}
