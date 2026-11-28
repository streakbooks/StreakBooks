export type DonationAllocation = {
  fund_id: string;
  amount_minor: number;
};

export function donationAllocations(input: {
  amountMinor: number;
  primaryFundId: string;
  secondaryFundId: string;
  secondaryMinor: number;
}): DonationAllocation[] {
  if (!input.primaryFundId) throw new Error("Choose a fund");
  if (input.amountMinor <= 0) throw new Error("Donation amount is invalid");
  if (!input.secondaryFundId) {
    return [{ fund_id: input.primaryFundId, amount_minor: input.amountMinor }];
  }
  if (input.secondaryFundId === input.primaryFundId) {
    throw new Error("Choose two different funds");
  }
  if (input.secondaryMinor <= 0 || input.secondaryMinor >= input.amountMinor) {
    throw new Error("The second fund needs an amount below the donation");
  }
  return [
    { fund_id: input.primaryFundId, amount_minor: input.amountMinor - input.secondaryMinor },
    { fund_id: input.secondaryFundId, amount_minor: input.secondaryMinor },
  ];
}
