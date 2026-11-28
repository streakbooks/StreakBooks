import { describe, expect, it } from "vitest";
import { assertPlanIntegrity, planNonprofitTransaction } from "./posting-plan";

const general = "fund-general";
const relief = "fund-relief";

function accounts(plan: ReturnType<typeof planNonprofitTransaction>) {
  return plan.lines.map((row) => row.account);
}

describe("nonprofit posting policy", () => {
  it("recognises an unrestricted cash donation as revenue", () => {
    const plan = planNonprofitTransaction({
      kind: "cash_donation",
      conditional: false,
      allocations: [{ fundId: general, amountMinor: 10_000, restricted: false }],
    });
    expect(plan.recognised).toBe(true);
    expect(accounts(plan)).toEqual(["bank", "contribution_revenue"]);
    assertPlanIntegrity(plan);
  });

  it("keeps a donor-restricted unconditional donation as revenue, not a liability", () => {
    const plan = planNonprofitTransaction({
      kind: "cash_donation",
      conditional: false,
      allocations: [{ fundId: relief, amountMinor: 8_000, restricted: true }],
    });
    expect(plan.recognised).toBe(true);
    expect(accounts(plan)).toContain("restricted_contribution_revenue");
    expect(accounts(plan)).not.toContain("refundable_advance");
    assertPlanIntegrity(plan);
  });

  it("splits a donation across funds and keeps each fund balanced", () => {
    const plan = planNonprofitTransaction({
      kind: "cash_donation",
      conditional: false,
      feeMinor: 300,
      allocations: [
        { fundId: general, amountMinor: 6_000, restricted: false },
        { fundId: relief, amountMinor: 4_000, restricted: true },
      ],
    });
    const byFund = new Map<string, { debit: number; credit: number }>();
    for (const row of plan.lines) {
      const totals = byFund.get(row.fundId) ?? { debit: 0, credit: 0 };
      totals.debit += row.debitMinor;
      totals.credit += row.creditMinor;
      byFund.set(row.fundId, totals);
    }
    expect(byFund.get(general)).toEqual({ debit: 6_000, credit: 6_000 });
    expect(byFund.get(relief)).toEqual({ debit: 4_000, credit: 4_000 });
    expect(plan.lines.reduce((sum, row) => sum + row.debitMinor, 0)).toBe(10_000);
    assertPlanIntegrity(plan);
  });

  it("does not recognise a conditional pledge", () => {
    const plan = planNonprofitTransaction({
      kind: "pledge_recognition",
      fundId: general,
      amountMinor: 5_000,
      unconditional: false,
      restricted: false,
    });
    expect(plan.recognised).toBe(false);
    expect(plan.lines).toEqual([]);
    assertPlanIntegrity(plan);
  });

  it("recognises an unconditional pledge once and collects it without new revenue", () => {
    const recognised = planNonprofitTransaction({
      kind: "pledge_recognition",
      fundId: general,
      amountMinor: 5_000,
      unconditional: true,
      restricted: false,
    });
    const collected = planNonprofitTransaction({
      kind: "pledge_collection",
      fundId: general,
      amountMinor: 5_000,
    });
    expect(accounts(recognised)).toEqual(["contributions_receivable", "contribution_revenue"]);
    expect(accounts(collected)).toEqual(["bank", "contributions_receivable"]);
    expect(accounts(collected)).not.toContain("contribution_revenue");
    assertPlanIntegrity(recognised);
    assertPlanIntegrity(collected);
  });

  it("holds conditional grant cash as a refundable advance until conditions are satisfied", () => {
    const advance = planNonprofitTransaction({
      kind: "grant_funding",
      fundId: relief,
      amountMinor: 50_000,
      conditional: true,
    });
    const recognised = planNonprofitTransaction({
      kind: "grant_recognition",
      fundId: relief,
      amountMinor: 20_000,
    });
    expect(advance.recognised).toBe(false);
    expect(accounts(advance)).toEqual(["bank", "refundable_advance"]);
    expect(accounts(recognised)).toEqual(["refundable_advance", "grant_revenue"]);
    assertPlanIntegrity(advance);
    assertPlanIntegrity(recognised);
  });

  it("classifies programme, administration and fundraising expenses separately", () => {
    for (const [functional, account] of [
      ["programme", "programme_expense"],
      ["administration", "administration_expense"],
      ["fundraising", "fundraising_expense"],
    ] as const) {
      const plan = planNonprofitTransaction({
        kind: "functional_expense",
        fundId: general,
        amountMinor: 1_500,
        functional,
        credit: "bank",
      });
      expect(plan.lines[0]?.account).toBe(account);
      assertPlanIntegrity(plan);
    }
  });

  it("recognises donated inventory and the distribution that follows", () => {
    const received = planNonprofitTransaction({
      kind: "donated_inventory",
      fundId: relief,
      amountMinor: 2_500,
      restricted: true,
    });
    const distributed = planNonprofitTransaction({
      kind: "inventory_distribution",
      fundId: relief,
      amountMinor: 2_500,
    });
    expect(accounts(received)).toEqual(["inventory", "restricted_contribution_revenue"]);
    expect(accounts(distributed)).toEqual(["programme_expense", "inventory"]);
    assertPlanIntegrity(received);
    assertPlanIntegrity(distributed);
  });

  it("does not invent a journal for donated services", () => {
    const plan = planNonprofitTransaction({ kind: "donated_services", recognise: false });
    expect(plan.lines).toEqual([]);
    expect(planNonprofitTransaction({ kind: "donated_services", recognise: true }).lines).toEqual(
      [],
    );
  });

  it("capitalises a donated asset and depreciates it inside the fund", () => {
    const asset = planNonprofitTransaction({
      kind: "donated_asset",
      fundId: general,
      amountMinor: 90_000,
      restricted: false,
    });
    const depreciation = planNonprofitTransaction({
      kind: "depreciation",
      fundId: general,
      amountMinor: 1_000,
    });
    expect(accounts(asset)).toEqual(["fixed_asset", "contribution_revenue"]);
    expect(accounts(depreciation)).toEqual(["depreciation_expense", "accumulated_depreciation"]);
    assertPlanIntegrity(asset);
    assertPlanIntegrity(depreciation);
  });

  it("accrues payroll and pays it without recognising the cost twice", () => {
    const accrual = planNonprofitTransaction({
      kind: "payroll_accrual",
      fundId: general,
      amountMinor: 4_000,
    });
    const payment = planNonprofitTransaction({
      kind: "payroll_payment",
      fundId: general,
      amountMinor: 4_000,
    });
    expect(accounts(accrual)).toEqual(["payroll_expense", "payroll_payable"]);
    expect(accounts(payment)).toEqual(["payroll_payable", "bank"]);
    assertPlanIntegrity(accrual);
    assertPlanIntegrity(payment);
  });

  it("balances interfund transfers and restriction releases inside every fund", () => {
    const transfer = planNonprofitTransaction({
      kind: "interfund_transfer",
      fromFundId: general,
      toFundId: relief,
      amountMinor: 2_000,
    });
    const release = planNonprofitTransaction({
      kind: "restriction_release",
      fromFundId: relief,
      toFundId: general,
      amountMinor: 750,
    });
    assertPlanIntegrity(transfer);
    assertPlanIntegrity(release);
    expect(accounts(release)).toEqual([
      "restriction_release_debit",
      "due_to",
      "due_from",
      "restriction_release_credit",
    ]);
  });

  it("refunds a donation and records a chargeback fee without an unbalanced fund", () => {
    const refund = planNonprofitTransaction({
      kind: "donation_refund",
      fundId: general,
      amountMinor: 10_000,
      restricted: false,
    });
    const chargeback = planNonprofitTransaction({
      kind: "chargeback",
      fundId: general,
      amountMinor: 10_000,
      restricted: false,
      feeMinor: 150,
    });
    expect(accounts(refund)).toEqual(["contribution_revenue", "bank"]);
    expect(chargeback.lines.reduce((sum, row) => sum + row.creditMinor, 0)).toBe(10_150);
    assertPlanIntegrity(refund);
    assertPlanIntegrity(chargeback);
  });

  it("records foreign-currency settlement gain and loss in the fund", () => {
    const gain = planNonprofitTransaction({
      kind: "fx_settlement",
      fundId: general,
      differenceMinor: 200,
    });
    const loss = planNonprofitTransaction({
      kind: "fx_settlement",
      fundId: general,
      differenceMinor: -200,
    });
    expect(accounts(gain)).toEqual(["bank", "fx_gain"]);
    expect(accounts(loss)).toEqual(["fx_loss", "bank"]);
    assertPlanIntegrity(gain);
    assertPlanIntegrity(loss);
  });

  it("returns a grant advance and impairs a pledge without new contribution revenue", () => {
    const refund = planNonprofitTransaction({
      kind: "grant_refund",
      fundId: relief,
      amountMinor: 1_000,
    });
    const impairment = planNonprofitTransaction({
      kind: "pledge_impairment",
      fundId: general,
      amountMinor: 400,
    });
    expect(accounts(refund)).toEqual(["refundable_advance", "bank"]);
    expect(accounts(impairment)).toEqual(["pledge_impairment", "contributions_receivable"]);
    assertPlanIntegrity(refund);
    assertPlanIntegrity(impairment);
  });
});
