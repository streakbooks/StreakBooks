// Synthetic balanced facts used only by automated tests and the isolated browser fixture.
import type { ReportingFacts } from "../report-document";
export const testCompany = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const bankId = "11111111-1111-4111-8111-111111111111",
  revenueId = "22222222-2222-4222-8222-222222222222",
  expenseId = "33333333-3333-4333-8333-333333333333";
export function reportingFactsFixture(): ReportingFacts {
  const account = (
    id: string,
    code: string,
    name: string,
    account_type: "asset" | "income" | "expense",
    subtype: string,
  ) => ({
    id,
    code,
    name,
    account_type,
    subtype,
    account_kind: subtype,
    system_key: null,
    fs_line: null,
    cash_flow_class: null,
    is_control: false,
    is_active: true,
    is_postable: true,
    show_on_dashboard_watchlist: false,
  });
  const period = [
    { account_id: bankId, debit_minor: "15000", credit_minor: "4000", line_count: 2 },
    { account_id: revenueId, debit_minor: "0", credit_minor: "15000", line_count: 1 },
    { account_id: expenseId, debit_minor: "4000", credit_minor: "0", line_count: 1 },
  ];
  return {
    schemaVersion: 1,
    capturedAt: "2026-11-02T00:00:00Z",
    from: "2026-10-01",
    to: "2026-10-31",
    fyStart: "2026-01-01",
    priorFrom: "2026-08-31",
    priorTo: "2026-09-30",
    company: {
      id: testCompany,
      name: "Isolated report fixture",
      baseCurrency: "GBP",
      fyEndMonth: 12,
      fyEndDay: 31,
    },
    accounts: [
      account(bankId, "1000", "Fixture bank", "asset", "bank"),
      account(revenueId, "4000", "Fixture revenue", "income", "revenue"),
      account(expenseId, "6000", "Fixture expense", "expense", "opex"),
    ],
    period,
    prior: [],
    bsPrior: [],
    bsCurrent: period,
    cash: [
      {
        bank_account_name: "Fixture bank",
        gl_account_id: bankId,
        opening_minor: "0",
        received_minor: "15000",
        spent_minor: "4000",
        transfers_in_minor: "0",
        transfers_out_minor: "0",
        closing_minor: "11000",
      },
    ],
  };
}
