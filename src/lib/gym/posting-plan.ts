/**
 * Journal specification for gym events.
 * Database RPCs post through public.post_journal. This module never posts.
 * Earned revenue, invoiced revenue and cash are separate events.
 */

export type GymAccountRole =
  | "accounts_receivable"
  | "bank"
  | "deferred_membership_revenue"
  | "membership_revenue"
  | "joining_fee_revenue"
  | "tax_liability"
  | "prepaid_session_liability"
  | "session_revenue"
  | "class_revenue"
  | "commission_expense"
  | "commission_payable"
  | "cancellation_fee_revenue"
  | "voucher_liability"
  | "retail_revenue"
  | "maintenance_expense"
  | "royalty_revenue"
  | "processing_fee";

export type PlanLine = {
  account: GymAccountRole;
  debitMinor: number;
  creditMinor: number;
  description: string;
};

export type JournalPlan = {
  lines: PlanLine[];
  invoicedMinor: number;
  earnedMinor: number;
  cashMinor: number;
};

function line(account: GymAccountRole, debitMinor: number, creditMinor: number, description: string): PlanLine {
  if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor) || debitMinor < 0 || creditMinor < 0) {
    throw new Error("Journal amounts must be non-negative minor units");
  }
  if ((debitMinor > 0 && creditMinor > 0) || (debitMinor === 0 && creditMinor === 0)) {
    throw new Error("Each journal line needs one positive side");
  }
  return { account, debitMinor, creditMinor, description };
}

function assertBalances(lines: PlanLine[]): void {
  const debit = lines.reduce((sum, row) => sum + row.debitMinor, 0);
  const credit = lines.reduce((sum, row) => sum + row.creditMinor, 0);
  if (debit !== credit || debit <= 0) throw new Error("Journal does not balance");
}

export function planMembershipInvoice(input: {
  membershipMinor: number;
  joiningFeeMinor: number;
  taxMinor: number;
  joiningFeePolicy: "immediate" | "defer";
}): JournalPlan {
  const { membershipMinor, joiningFeeMinor, taxMinor } = input;
  for (const [label, amount] of [
    ["Membership", membershipMinor],
    ["Joining fee", joiningFeeMinor],
    ["Tax", taxMinor],
  ] as const) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`${label} is invalid`);
  }
  if (membershipMinor + joiningFeeMinor <= 0) throw new Error("Invoice needs a positive charge");
  const total = membershipMinor + joiningFeeMinor + taxMinor;
  const deferred = membershipMinor + (input.joiningFeePolicy === "defer" ? joiningFeeMinor : 0);
  const immediateJoining = input.joiningFeePolicy === "immediate" ? joiningFeeMinor : 0;
  const lines: PlanLine[] = [line("accounts_receivable", total, 0, "Membership invoice")];
  if (deferred > 0) lines.push(line("deferred_membership_revenue", 0, deferred, "Deferred membership"));
  if (immediateJoining > 0) lines.push(line("joining_fee_revenue", 0, immediateJoining, "Joining fee"));
  if (taxMinor > 0) lines.push(line("tax_liability", 0, taxMinor, "Tax on invoice"));
  assertBalances(lines);
  return {
    lines,
    invoicedMinor: total,
    earnedMinor: immediateJoining,
    cashMinor: 0,
  };
}

export function planCashReceipt(amountMinor: number): JournalPlan {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Receipt must be positive");
  const lines = [
    line("bank", amountMinor, 0, "Member receipt"),
    line("accounts_receivable", 0, amountMinor, "Receipt applied to receivable"),
  ];
  return { lines, invoicedMinor: 0, earnedMinor: 0, cashMinor: amountMinor };
}

export function planRecognition(amountMinor: number, description: string): JournalPlan {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Recognition must be positive");
  const lines = [
    line("deferred_membership_revenue", amountMinor, 0, description),
    line("membership_revenue", 0, amountMinor, description),
  ];
  return { lines, invoicedMinor: 0, earnedMinor: amountMinor, cashMinor: 0 };
}

export function planDeferredRefund(amountMinor: number, destination: "bank" | "accounts_receivable"): JournalPlan {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Refund must be positive");
  const lines = [
    line("deferred_membership_revenue", amountMinor, 0, "Refund of unrecognised membership"),
    line(destination, 0, amountMinor, "Refund of unrecognised membership"),
  ];
  return { lines, invoicedMinor: 0, earnedMinor: 0, cashMinor: destination === "bank" ? -amountMinor : 0 };
}

export function planForfeit(amountMinor: number): JournalPlan {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Forfeit must be positive");
  const lines = [
    line("deferred_membership_revenue", amountMinor, 0, "Forfeit of unused membership under contract policy"),
    line("cancellation_fee_revenue", 0, amountMinor, "Cancellation fee"),
  ];
  return { lines, invoicedMinor: 0, earnedMinor: amountMinor, cashMinor: 0 };
}

export function planSessionSale(amountMinor: number): JournalPlan {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Package price must be positive");
  const lines = [
    line("accounts_receivable", amountMinor, 0, "Prepaid sessions invoiced"),
    line("prepaid_session_liability", 0, amountMinor, "Prepaid session obligation"),
  ];
  return { lines, invoicedMinor: amountMinor, earnedMinor: 0, cashMinor: 0 };
}

export function planSessionConsumption(amountMinor: number): JournalPlan {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Consumption must be positive");
  const lines = [
    line("prepaid_session_liability", amountMinor, 0, "Session delivered"),
    line("session_revenue", 0, amountMinor, "Session revenue"),
  ];
  return { lines, invoicedMinor: 0, earnedMinor: amountMinor, cashMinor: 0 };
}

export function planCommission(amountMinor: number): JournalPlan {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Commission must be positive");
  const lines = [
    line("commission_expense", amountMinor, 0, "Trainer commission"),
    line("commission_payable", 0, amountMinor, "Trainer commission payable"),
  ];
  return { lines, invoicedMinor: 0, earnedMinor: 0, cashMinor: 0 };
}

export function planVoucherIssue(amountMinor: number): JournalPlan {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Voucher must be positive");
  const lines = [
    line("bank", amountMinor, 0, "Customer-funded voucher"),
    line("voucher_liability", 0, amountMinor, "Gift voucher liability"),
  ];
  return { lines, invoicedMinor: 0, earnedMinor: 0, cashMinor: amountMinor };
}

export function planVoucherRedemption(amountMinor: number): JournalPlan {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Redemption must be positive");
  const lines = [
    line("voucher_liability", amountMinor, 0, "Voucher applied to receivable"),
    line("accounts_receivable", 0, amountMinor, "Voucher applied to receivable"),
  ];
  return { lines, invoicedMinor: 0, earnedMinor: 0, cashMinor: 0 };
}
