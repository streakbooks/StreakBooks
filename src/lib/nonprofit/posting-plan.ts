/**
 * Policy planner for nonprofit journals.
 * The database RPCs are the posting authority. This module is the tested
 * specification for which accounts move, and it never posts by itself.
 *
 * Restricted unconditional contributions credit contribution revenue.
 * They are not classified as liabilities.
 * Conditional contributions and conditional pledges are not revenue.
 */

export type AccountRole =
  | "bank"
  | "accounts_payable"
  | "contribution_revenue"
  | "restricted_contribution_revenue"
  | "contributions_receivable"
  | "refundable_advance"
  | "grant_revenue"
  | "programme_expense"
  | "administration_expense"
  | "fundraising_expense"
  | "inventory"
  | "fixed_asset"
  | "accumulated_depreciation"
  | "depreciation_expense"
  | "payroll_expense"
  | "payroll_payable"
  | "due_to"
  | "due_from"
  | "transfer_out"
  | "transfer_in"
  | "restriction_release_debit"
  | "restriction_release_credit"
  | "investment_income"
  | "pledge_impairment"
  | "processing_fee"
  | "fx_gain"
  | "fx_loss";

export type FunctionalClass = "programme" | "administration" | "fundraising";

export type JournalPlanLine = {
  account: AccountRole;
  fundId: string;
  debitMinor: number;
  creditMinor: number;
  description: string;
};

export type JournalPlan = {
  recognised: boolean;
  reason: string;
  lines: JournalPlanLine[];
};

type Allocation = { fundId: string; amountMinor: number; restricted: boolean };

export type NonprofitTransaction =
  | {
      kind: "cash_donation";
      allocations: Allocation[];
      conditional: boolean;
      feeMinor?: number;
    }
  | {
      kind: "pledge_recognition";
      fundId: string;
      amountMinor: number;
      unconditional: boolean;
      restricted: boolean;
    }
  | { kind: "pledge_collection"; fundId: string; amountMinor: number }
  | { kind: "pledge_impairment"; fundId: string; amountMinor: number }
  | { kind: "grant_funding"; fundId: string; amountMinor: number; conditional: boolean }
  | { kind: "grant_recognition"; fundId: string; amountMinor: number }
  | { kind: "grant_refund"; fundId: string; amountMinor: number }
  | {
      kind: "functional_expense";
      fundId: string;
      amountMinor: number;
      functional: FunctionalClass;
      credit: "bank" | "accounts_payable";
    }
  | { kind: "donated_inventory"; fundId: string; amountMinor: number; restricted: boolean }
  | { kind: "inventory_distribution"; fundId: string; amountMinor: number }
  | { kind: "donated_asset"; fundId: string; amountMinor: number; restricted: boolean }
  | { kind: "donated_services"; recognise: boolean }
  | { kind: "depreciation"; fundId: string; amountMinor: number }
  | { kind: "payroll_accrual"; fundId: string; amountMinor: number }
  | { kind: "payroll_payment"; fundId: string; amountMinor: number }
  | { kind: "investment_income"; fundId: string; amountMinor: number }
  | { kind: "restriction_release"; fromFundId: string; toFundId: string; amountMinor: number }
  | { kind: "interfund_transfer"; fromFundId: string; toFundId: string; amountMinor: number }
  | {
      kind: "donation_refund";
      fundId: string;
      amountMinor: number;
      restricted: boolean;
      /** Portion of the original processing fee the gateway returns with the refund. */
      feeReturnedMinor?: number;
    }
  | {
      kind: "chargeback";
      fundId: string;
      amountMinor: number;
      restricted: boolean;
      feeMinor: number;
    }
  | { kind: "fx_settlement"; fundId: string; differenceMinor: number };

function line(
  account: AccountRole,
  fundId: string,
  debitMinor: number,
  creditMinor: number,
  description: string,
): JournalPlanLine {
  return { account, fundId, debitMinor, creditMinor, description };
}

function positive(amount: number, label: string): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`${label} must be a positive minor-unit integer`);
  }
  return amount;
}

function revenueRole(restricted: boolean): AccountRole {
  return restricted ? "restricted_contribution_revenue" : "contribution_revenue";
}

function expenseRole(functional: FunctionalClass): AccountRole {
  if (functional === "programme") return "programme_expense";
  if (functional === "administration") return "administration_expense";
  return "fundraising_expense";
}

/** Largest-remainder fee shares. The last fund absorbs the rounding remainder. */
export function allocateMinor(amounts: readonly number[], total: number): number[] {
  if (total < 0 || !Number.isSafeInteger(total)) throw new Error("Allocation total is invalid");
  const base = amounts.reduce((sum, amount) => sum + amount, 0);
  if (base <= 0) throw new Error("Allocation base must be positive");
  if (total === 0) return amounts.map(() => 0);
  let assigned = 0;
  return amounts.map((amount, index) => {
    if (index === amounts.length - 1) return total - assigned;
    const share = Math.floor((total * amount) / base);
    assigned += share;
    return share;
  });
}

function donationLines(
  allocations: Allocation[],
  conditional: boolean,
  feeMinor: number,
): JournalPlanLine[] {
  if (allocations.length === 0) throw new Error("A donation needs at least one fund");
  const amounts = allocations.map((row) => positive(row.amountMinor, "Allocation"));
  const fees = allocateMinor(amounts, feeMinor);
  const lines: JournalPlanLine[] = [];
  allocations.forEach((row, index) => {
    const fee = fees[index] ?? 0;
    const net = row.amountMinor - fee;
    if (net < 0) throw new Error("Gateway fee cannot exceed the donation");
    const credit = conditional ? "refundable_advance" : revenueRole(row.restricted);
    if (net > 0) {
      lines.push(line("bank", row.fundId, net, 0, "Donation received"));
    }
    if (fee > 0) {
      lines.push(line("processing_fee", row.fundId, fee, 0, "Payment processing fee"));
    }
    lines.push(line(credit, row.fundId, 0, row.amountMinor, "Contribution"));
  });
  return lines;
}

export function planNonprofitTransaction(transaction: NonprofitTransaction): JournalPlan {
  switch (transaction.kind) {
    case "cash_donation": {
      const fee = transaction.feeMinor ?? 0;
      if (!Number.isSafeInteger(fee) || fee < 0) throw new Error("Fee is invalid");
      return {
        recognised: !transaction.conditional,
        reason: transaction.conditional
          ? "Conditional contribution is a refundable advance, not revenue"
          : "Unconditional contribution is revenue, including when donor-restricted",
        lines: donationLines(transaction.allocations, transaction.conditional, fee),
      };
    }
    case "pledge_recognition": {
      positive(transaction.amountMinor, "Pledge");
      if (!transaction.unconditional) {
        return {
          recognised: false,
          reason: "Conditional pledge is not recognised as revenue or a receivable",
          lines: [],
        };
      }
      return {
        recognised: true,
        reason: "Unconditional pledge is a receivable and contribution revenue",
        lines: [
          line(
            "contributions_receivable",
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Pledge receivable",
          ),
          line(
            revenueRole(transaction.restricted),
            transaction.fundId,
            0,
            transaction.amountMinor,
            "Pledge contribution",
          ),
        ],
      };
    }
    case "pledge_collection":
      positive(transaction.amountMinor, "Collection");
      return {
        recognised: false,
        reason: "Collection settles the receivable and does not recognise revenue again",
        lines: [
          line("bank", transaction.fundId, transaction.amountMinor, 0, "Pledge collected"),
          line(
            "contributions_receivable",
            transaction.fundId,
            0,
            transaction.amountMinor,
            "Pledge settled",
          ),
        ],
      };
    case "pledge_impairment":
      positive(transaction.amountMinor, "Impairment");
      return {
        recognised: false,
        reason: "Impairment reduces the receivable and does not reverse the original revenue",
        lines: [
          line(
            "pledge_impairment",
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Pledge impairment",
          ),
          line(
            "contributions_receivable",
            transaction.fundId,
            0,
            transaction.amountMinor,
            "Receivable written down",
          ),
        ],
      };
    case "grant_funding":
      positive(transaction.amountMinor, "Grant funding");
      return {
        recognised: !transaction.conditional,
        reason: transaction.conditional
          ? "Conditional grant cash is a refundable advance"
          : "Unconditional grant funding is grant revenue",
        lines: [
          line("bank", transaction.fundId, transaction.amountMinor, 0, "Grant funding"),
          line(
            transaction.conditional ? "refundable_advance" : "grant_revenue",
            transaction.fundId,
            0,
            transaction.amountMinor,
            transaction.conditional ? "Refundable grant advance" : "Grant revenue",
          ),
        ],
      };
    case "grant_recognition":
      positive(transaction.amountMinor, "Grant recognition");
      return {
        recognised: true,
        reason: "Revenue is recognised only for the conditions that are satisfied",
        lines: [
          line(
            "refundable_advance",
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Grant conditions satisfied",
          ),
          line("grant_revenue", transaction.fundId, 0, transaction.amountMinor, "Grant revenue"),
        ],
      };
    case "grant_refund":
      positive(transaction.amountMinor, "Grant refund");
      return {
        recognised: false,
        reason: "Returned advance reduces the liability and cash",
        lines: [
          line(
            "refundable_advance",
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Grant advance returned",
          ),
          line("bank", transaction.fundId, 0, transaction.amountMinor, "Grant refund paid"),
        ],
      };
    case "functional_expense":
      positive(transaction.amountMinor, "Expense");
      return {
        recognised: false,
        reason: "Functional expense uses the selected class and does not recognise income",
        lines: [
          line(
            expenseRole(transaction.functional),
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Functional expense",
          ),
          line(
            transaction.credit,
            transaction.fundId,
            0,
            transaction.amountMinor,
            "Expense settlement",
          ),
        ],
      };
    case "donated_inventory":
      positive(transaction.amountMinor, "Inventory");
      return {
        recognised: true,
        reason: "Recognisable donated inventory is an asset and contribution revenue",
        lines: [
          line("inventory", transaction.fundId, transaction.amountMinor, 0, "Donated inventory"),
          line(
            revenueRole(transaction.restricted),
            transaction.fundId,
            0,
            transaction.amountMinor,
            "In-kind contribution",
          ),
        ],
      };
    case "inventory_distribution":
      positive(transaction.amountMinor, "Distribution");
      return {
        recognised: false,
        reason: "Distribution moves donated inventory to programme expense",
        lines: [
          line(
            "programme_expense",
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Inventory distributed",
          ),
          line("inventory", transaction.fundId, 0, transaction.amountMinor, "Inventory relieved"),
        ],
      };
    case "donated_asset":
      positive(transaction.amountMinor, "Asset");
      return {
        recognised: true,
        reason: "Recognisable donated asset is capitalised and contribution revenue",
        lines: [
          line("fixed_asset", transaction.fundId, transaction.amountMinor, 0, "Donated asset"),
          line(
            revenueRole(transaction.restricted),
            transaction.fundId,
            0,
            transaction.amountMinor,
            "In-kind contribution",
          ),
        ],
      };
    case "donated_services":
      return {
        recognised: false,
        reason: transaction.recognise
          ? "Donated services still require the organisation's recognition policy and evidence before a journal is proposed"
          : "Donated services are not recognised unless the recognition criteria are met",
        lines: [],
      };
    case "depreciation":
      positive(transaction.amountMinor, "Depreciation");
      return {
        recognised: false,
        reason: "Depreciation stays inside the fund that holds the asset",
        lines: [
          line(
            "depreciation_expense",
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Depreciation",
          ),
          line(
            "accumulated_depreciation",
            transaction.fundId,
            0,
            transaction.amountMinor,
            "Accumulated depreciation",
          ),
        ],
      };
    case "payroll_accrual":
      positive(transaction.amountMinor, "Payroll");
      return {
        recognised: false,
        reason: "Payroll cost is accrued to the fund before payment",
        lines: [
          line("payroll_expense", transaction.fundId, transaction.amountMinor, 0, "Salary cost"),
          line(
            "payroll_payable",
            transaction.fundId,
            0,
            transaction.amountMinor,
            "Payroll payable",
          ),
        ],
      };
    case "payroll_payment":
      positive(transaction.amountMinor, "Payroll payment");
      return {
        recognised: false,
        reason: "Payment settles the accrual and does not recognise the cost again",
        lines: [
          line(
            "payroll_payable",
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Payroll payable settled",
          ),
          line("bank", transaction.fundId, 0, transaction.amountMinor, "Payroll paid"),
        ],
      };
    case "investment_income":
      positive(transaction.amountMinor, "Investment income");
      return {
        recognised: true,
        reason: "Investment income is recognised when receivable or received",
        lines: [
          line(
            "bank",
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Investment income received",
          ),
          line(
            "investment_income",
            transaction.fundId,
            0,
            transaction.amountMinor,
            "Investment income",
          ),
        ],
      };
    case "restriction_release":
      positive(transaction.amountMinor, "Release");
      if (transaction.fromFundId === transaction.toFundId) {
        throw new Error("Restriction release needs two different funds");
      }
      return {
        recognised: false,
        reason: "Release reclassifies net assets and balances each fund with due-to and due-from",
        lines: [
          line(
            "restriction_release_debit",
            transaction.fromFundId,
            transaction.amountMinor,
            0,
            "Released from restriction",
          ),
          line("due_to", transaction.fromFundId, 0, transaction.amountMinor, "Due to unrestricted"),
          line("due_from", transaction.toFundId, transaction.amountMinor, 0, "Due from restricted"),
          line(
            "restriction_release_credit",
            transaction.toFundId,
            0,
            transaction.amountMinor,
            "Released to unrestricted",
          ),
        ],
      };
    case "interfund_transfer":
      positive(transaction.amountMinor, "Transfer");
      if (transaction.fromFundId === transaction.toFundId) {
        throw new Error("Interfund transfer needs two different funds");
      }
      return {
        recognised: false,
        reason: "Resource transfer moves cash and balances both funds",
        lines: [
          line("transfer_out", transaction.fromFundId, transaction.amountMinor, 0, "Transfer out"),
          line("bank", transaction.fromFundId, 0, transaction.amountMinor, "Cash transferred"),
          line("bank", transaction.toFundId, transaction.amountMinor, 0, "Cash received"),
          line("transfer_in", transaction.toFundId, 0, transaction.amountMinor, "Transfer in"),
        ],
      };
    case "donation_refund": {
      positive(transaction.amountMinor, "Refund");
      const fee = transaction.feeReturnedMinor ?? 0;
      if (!Number.isSafeInteger(fee) || fee < 0 || fee > transaction.amountMinor) {
        throw new Error("Refund fee is invalid");
      }
      const lines = [
        line(
          revenueRole(transaction.restricted),
          transaction.fundId,
          transaction.amountMinor,
          0,
          "Contribution refunded",
        ),
      ];
      if (fee > 0) {
        lines.push(
          line("bank", transaction.fundId, 0, transaction.amountMinor - fee, "Refund net"),
        );
        lines.push(line("processing_fee", transaction.fundId, 0, fee, "Processing fee reversed"));
      } else {
        lines.push(
          line("bank", transaction.fundId, 0, transaction.amountMinor, "Refund paid to donor"),
        );
      }
      return {
        recognised: false,
        reason: "Refund reverses the contribution. It does not create a new expense by default",
        lines,
      };
    }
    case "chargeback":
      positive(transaction.amountMinor, "Chargeback");
      if (!Number.isSafeInteger(transaction.feeMinor) || transaction.feeMinor < 0) {
        throw new Error("Chargeback fee is invalid");
      }
      return {
        recognised: false,
        reason: "Chargeback reverses the contribution and can record an additional gateway fee",
        lines: [
          line(
            revenueRole(transaction.restricted),
            transaction.fundId,
            transaction.amountMinor,
            0,
            "Chargeback",
          ),
          ...(transaction.feeMinor > 0
            ? [
                line(
                  "processing_fee",
                  transaction.fundId,
                  transaction.feeMinor,
                  0,
                  "Chargeback fee",
                ),
              ]
            : []),
          line(
            "bank",
            transaction.fundId,
            0,
            transaction.amountMinor + transaction.feeMinor,
            "Chargeback settled",
          ),
        ],
      };
    case "fx_settlement": {
      if (!Number.isSafeInteger(transaction.differenceMinor) || transaction.differenceMinor === 0) {
        throw new Error("FX difference must be a non-zero minor-unit integer");
      }
      const gain = transaction.differenceMinor > 0;
      const amount = Math.abs(transaction.differenceMinor);
      return {
        recognised: true,
        reason: gain
          ? "Settlement above the booked base amount is an exchange gain"
          : "Settlement below the booked base amount is an exchange loss",
        lines: gain
          ? [
              line("bank", transaction.fundId, amount, 0, "Foreign currency gain"),
              line("fx_gain", transaction.fundId, 0, amount, "Exchange gain"),
            ]
          : [
              line("fx_loss", transaction.fundId, amount, 0, "Exchange loss"),
              line("bank", transaction.fundId, 0, amount, "Foreign currency loss"),
            ],
      };
    }
    default: {
      const exhaustive: never = transaction;
      return exhaustive;
    }
  }
}

export function assertPlanIntegrity(plan: JournalPlan): void {
  if (!plan.recognised && plan.lines.length === 0) return;
  if (plan.lines.length < 2)
    throw new Error("A recognised or posting plan needs at least two lines");
  let debit = 0;
  let credit = 0;
  const byFund = new Map<string, { debit: number; credit: number }>();
  for (const row of plan.lines) {
    if (
      !Number.isSafeInteger(row.debitMinor) ||
      !Number.isSafeInteger(row.creditMinor) ||
      row.debitMinor < 0 ||
      row.creditMinor < 0 ||
      (row.debitMinor > 0 && row.creditMinor > 0) ||
      (row.debitMinor === 0 && row.creditMinor === 0)
    ) {
      throw new Error("Each line needs exactly one positive side");
    }
    debit += row.debitMinor;
    credit += row.creditMinor;
    const fund = byFund.get(row.fundId) ?? { debit: 0, credit: 0 };
    fund.debit += row.debitMinor;
    fund.credit += row.creditMinor;
    byFund.set(row.fundId, fund);
  }
  if (debit !== credit || debit === 0) throw new Error("Journal does not balance");
  for (const [fundId, totals] of byFund) {
    if (totals.debit !== totals.credit) {
      throw new Error(`Fund ${fundId} does not balance`);
    }
  }
}
