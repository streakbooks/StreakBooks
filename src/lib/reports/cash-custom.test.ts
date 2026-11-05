import { describe, expect, it } from "vitest";
import { cashInputFixture, arId } from "./__fixtures__/cash-facts";
import { reportingFactsFixture, bankId, revenueId, testCompany } from "./__fixtures__/facts";
import { cashCustomFacts } from "./cash-custom";
import { cashReportingFacts } from "./cash-report-facts";
import { customDefinitionSchema, starterDefinition } from "./custom-definition";
import { buildReportDocument, PACK_REPORTS } from "./report-document";
import { packConfigSchema } from "./ecosystem-model";
import { reportFiltersSchema } from "./report-filters";
import type { CashSourceRows } from "./cash-source";
import type { CashPnlInput } from "./cash-profit-loss";

function baseFacts() {
  const facts = reportingFactsFixture();
  facts.from = "2026-11-01";
  facts.to = "2026-11-30";
  facts.priorFrom = "2026-10-01";
  facts.priorTo = "2026-10-31";
  facts.accounts = cashInputFixture().accounts;
  // Deliberately different accrual totals must never leak into cash custom columns.
  return facts;
}

function sourceSnapshot(input: CashPnlInput): CashSourceRows {
  const payment = (row: CashPnlInput["payments"][number]) => ({
    id: row.id,
    company_id: row.companyId,
    posted_journal_id: row.journalId,
    void_journal_id: row.voidJournalId,
    currency_code: row.currency,
    fx_rate_to_base: row.rate,
    amount_minor: row.amount.toString(),
  });
  return {
    journal_lines: input.journals.flatMap((journal) =>
      journal.lines.map((line, index) => ({
        id: line.lineId ?? `${journal.id}:${index}`,
        description: line.description ?? null,
        account_id: line.accountId,
        debit_minor: line.debit.toString(),
        credit_minor: line.credit.toString(),
        journals: {
          id: journal.id,
          company_id: journal.companyId,
          journal_date: journal.date,
          journal_number: journal.number,
          memo: journal.memo ?? null,
          source_type: journal.sourceType,
          source_id: journal.sourceId,
          currency_code: journal.currency,
          fx_rate_to_base: journal.rate,
          reverses_journal_id: journal.reverses,
        },
      })),
    ),
    bank_accounts: [{ gl_account_id: bankId }],
    sales_receipts: input.payments.filter((row) => row.side === "income").map(payment),
    supplier_payments: input.payments.filter((row) => row.side === "expense").map(payment),
    sales_receipt_allocations: input.allocations
      .filter((row) => row.paymentId === "receipt")
      .map((row) => ({
        id: row.id,
        company_id: row.companyId,
        receipt_id: row.paymentId,
        invoice_id: row.documentId,
        amount_minor: row.amount.toString(),
        reversed_on: row.reversedOn,
        allocated_on: row.allocatedOn ?? null,
      })),
    supplier_payment_allocations: input.allocations
      .filter((row) => row.paymentId === "payment")
      .map((row) => ({
        id: row.id,
        company_id: row.companyId,
        payment_id: row.paymentId,
        bill_id: row.documentId,
        amount_minor: row.amount.toString(),
        allocated_on: row.allocatedOn ?? null,
      })),
    money_documents: [],
    money_document_credit_uses: [],
    sales_credit_allocations: [],
    purchase_credit_allocations: [],
    cash_allocation_history: [],
    ...Object.fromEntries(
      [
        ["sales_invoice", "sales_invoices"],
        ["purchase_bill", "purchase_bills"],
        ["sales_credit_note", "sales_credit_notes"],
        ["purchase_credit_note", "purchase_credit_notes"],
      ].map(([kind, table]) => [
        table,
        (input.documentJournalLinks ?? [])
          .filter((link) => link.sourceType === kind)
          .map((link) => ({
            id: link.documentId,
            company_id: link.companyId,
            posted_journal_id: link.journalId,
          })),
      ]),
    ),
  };
}

describe("cash custom and saved-report facts", () => {
  it("uses receipt periods for custom account rows, comparisons and formula columns", () => {
    const definition = customDefinitionSchema.parse({
      ...starterDefinition(),
      basis: "cash",
      columns: [
        { id: "current", label: "Current", mode: "period" },
        { id: "prior", label: "Prior", mode: "prior_period" },
        { id: "change", label: "Change", mode: "calculated", formula: "[current]-[prior]" },
      ],
    });
    const facts = cashCustomFacts(baseFacts(), cashInputFixture(), definition);
    const document = buildReportDocument(facts, {
      name: definition.title,
      config: { _builder: definition },
    });
    expect(document.basis).toBe("cash");
    expect(document.sections[0]!.rows.find((row) => row.label === "Revenue")!.values).toEqual([
      "50.00",
      "0.00",
      "50.00",
    ]);
    expect(document.sections[0]!.rows.find((row) => row.label === "Net profit")!.values).toEqual([
      "10.00",
      "0.00",
      "10.00",
    ]);
    expect(document.subtitle).toContain("Cash basis");
  });

  it("recognizes multiple payments exactly once in distinct fixed custom periods", () => {
    const input = cashInputFixture();
    input.journals.push({
      ...input.journals.find((row) => row.id === "receipt-journal")!,
      id: "second-receipt-journal",
      date: "2026-12-02",
      sourceId: "receipt-2",
      lines: [
        { accountId: bankId, debit: 6000n, credit: 0n },
        { accountId: arId, debit: 0n, credit: 6000n },
      ],
    });
    input.payments.push({
      ...input.payments[0]!,
      id: "receipt-2",
      journalId: "second-receipt-journal",
    });
    input.allocations.push({
      ...input.allocations[0]!,
      id: "second-allocation",
      paymentId: "receipt-2",
    });
    const definition = customDefinitionSchema.parse({
      ...starterDefinition(),
      basis: "cash",
      columns: [
        { id: "november", label: "November", mode: "period" },
        { id: "december", label: "December", mode: "fixed", from: "2026-12-01", to: "2026-12-31" },
        { id: "total", label: "Both", mode: "calculated", formula: "[november]+[december]" },
      ],
    });
    const facts = cashCustomFacts(baseFacts(), input, definition);
    const document = buildReportDocument(facts, {
      name: definition.title,
      config: { _builder: definition },
    });
    expect(document.sections[0]!.rows.find((row) => row.label === "Revenue")!.values).toEqual([
      "50.00",
      "50.00",
      "100.00",
    ]);
  });

  it("applies existing account/date/amount filters after cash allocation", () => {
    const definition = customDefinitionSchema.parse({
      ...starterDefinition(),
      basis: "cash",
      filters: {
        clauses: [
          { field: "account_id", op: "eq", values: [revenueId] },
          { field: "journal_date", op: "between", values: ["2026-11-01", "2026-11-02"] },
          { field: "credit", op: "gt", values: ["40"] },
        ],
      },
    });
    const facts = cashCustomFacts(baseFacts(), cashInputFixture(), definition);
    expect(facts.customColumns![0]!.balances).toEqual([
      { account_id: revenueId, debit_minor: "0", credit_minor: "5000", line_count: 1 },
    ]);
    const doc = buildReportDocument(facts, {
      name: definition.title,
      config: { _builder: definition },
    });
    expect(doc.notes).toContain("Report filters:");
    expect(doc.sections[0]!.rows.find((row) => row.label === "Net profit")!.values).toEqual([
      "50.00",
    ]);
  });

  it("renders an immutable queued cash snapshot with the same custom calculations", () => {
    const base = baseFacts(),
      input = cashInputFixture();
    const definition = { ...starterDefinition(), basis: "cash" as const };
    const interactive = buildReportDocument(cashCustomFacts(base, input, definition), {
      name: definition.title,
      config: { _builder: definition },
    });
    const queued = buildReportDocument(
      { ...base, cashSourceVersion: 1, cashSource: sourceSnapshot(input) },
      { name: definition.title, config: { _builder: definition } },
    );
    expect(queued).toEqual(interactive);
    expect(() =>
      buildReportDocument(base, { name: definition.title, config: { _builder: definition } }),
    ).toThrow("Custom cash-basis facts were not captured");
  });

  it("keeps frozen custom values when legacy journal source IDs are null", () => {
    const base = baseFacts(),
      input = cashInputFixture();
    input.documentJournalLinks = input.journals
      .filter((journal) => ["sales_invoice", "purchase_bill"].includes(journal.sourceType))
      .map((journal) => ({
        companyId: input.companyId,
        documentId: journal.sourceId!,
        journalId: journal.id,
        sourceType: journal.sourceType as "sales_invoice" | "purchase_bill",
      }));
    input.journals
      .filter((journal) => ["sales_invoice", "purchase_bill"].includes(journal.sourceType))
      .forEach((journal) => {
        journal.sourceId = null;
      });
    const definition = customDefinitionSchema.parse({ ...starterDefinition(), basis: "cash" });
    const interactive = buildReportDocument(cashCustomFacts(base, input, definition), {
      name: definition.title,
      config: { _builder: definition },
    });
    const queued = buildReportDocument(
      { ...base, cashSourceVersion: 1, cashSource: sourceSnapshot(input) },
      { name: definition.title, config: { _builder: definition } },
    );
    expect(queued).toEqual(interactive);
    expect(queued.sections[0]!.rows.find((row) => row.label === "Net profit")!.values).toEqual([
      "10.00",
    ]);
  });

  it("preserves source-line description attribution in frozen filtered custom reports", () => {
    const base = baseFacts(),
      input = cashInputFixture();
    const invoice = input.journals.find((journal) => journal.id === "invoice-journal")!;
    invoice.lines = invoice.lines.flatMap((line) =>
      line.accountId === revenueId
        ? [
            { ...line, lineId: "consulting", description: "Consulting", credit: 6000n },
            { ...line, lineId: "training", description: "Training", credit: 4000n },
          ]
        : [line],
    );
    const definition = customDefinitionSchema.parse({
      ...starterDefinition(),
      basis: "cash",
      filters: {
        clauses: [{ field: "description", op: "eq", values: ["Consulting"] }],
      },
    });
    const interactive = buildReportDocument(cashCustomFacts(base, input, definition), {
      name: definition.title,
      config: { _builder: definition },
    });
    const queued = buildReportDocument(
      { ...base, cashSourceVersion: 1, cashSource: sourceSnapshot(input) },
      { name: definition.title, config: { _builder: definition } },
    );
    expect(queued).toEqual(interactive);
    expect(queued.sections[0]!.rows.find((row) => row.label === "Revenue")!.values).toEqual([
      "30.00",
    ]);
  });

  it("reconciles saved cash trial balance and indirect cash-flow source totals", () => {
    const base = baseFacts(),
      input = cashInputFixture();
    const facts = cashReportingFacts(base, input);
    const totalDebit = facts.bsCurrent.reduce((sum, row) => sum + BigInt(row.debit_minor), 0n);
    const totalCredit = facts.bsCurrent.reduce((sum, row) => sum + BigInt(row.credit_minor), 0n);
    expect(totalDebit).toBe(totalCredit);
    expect(facts.period.find((row) => row.account_id === revenueId)?.credit_minor).toBe("5000");
    const doc = buildReportDocument(facts, {
      name: "Cash trial balance",
      reportId: "trial-balance",
      config: { basis: "cash" },
    });
    expect(doc.basis).toBe("cash");
    expect(doc.sections[0]!.rows.find((row) => row.accountId === revenueId)?.values).toContain(
      "50.00",
    );
    const queued = buildReportDocument(
      { ...base, cashSourceVersion: 1, cashSource: sourceSnapshot(input) },
      { name: "Cash trial balance", reportId: "trial-balance", config: { basis: "cash" } },
    );
    expect(queued).toEqual(doc);
  });

  it("reconstructs a queued generic cash report with settings-only legacy basis", () => {
    const base = baseFacts(),
      input = cashInputFixture();
    const raw = { ...base, cashSourceVersion: 1, cashSource: sourceSnapshot(input) };
    const requested = {
      name: "Legacy cash trial balance",
      reportId: "trial-balance",
      config: { settings: JSON.stringify({ basis: "cash" }) },
    };
    const legacy = buildReportDocument(raw, requested);
    const explicit = buildReportDocument(raw, { ...requested, config: { basis: "cash" } });
    expect(legacy).toEqual(explicit);
    expect(legacy.basis).toBe("cash");
    const recognized = cashReportingFacts(base, input);
    expect(() =>
      buildReportDocument(recognized, {
        ...requested,
        config: { ...requested.config, basis: "accrual" },
      }),
    ).toThrow("Cash facts cannot be rendered as accrual");
  });

  it("rejects cross-company inputs and cash figures rendered as accrual", () => {
    const definition = { ...starterDefinition(), basis: "cash" as const };
    const input = cashInputFixture();
    expect(() =>
      cashCustomFacts(
        {
          ...baseFacts(),
          company: { ...baseFacts().company, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        },
        input,
        definition,
      ),
    ).toThrow("requested company");
    const facts = cashCustomFacts(baseFacts(), input, definition);
    expect(() =>
      buildReportDocument(facts, { name: "Accrual", config: { _builder: starterDefinition() } }),
    ).toThrow("Cash facts cannot be rendered as accrual");
    expect(testCompany).toBe(facts.company.id);
    expect(facts.appliedFilters).toEqual(reportFiltersSchema.parse({}));
  });

  it("renders every management-pack section from the same frozen cash snapshot", () => {
    const base = baseFacts(),
      input = cashInputFixture();
    base.cash = [
      {
        bank_account_name: "Fixture bank",
        gl_account_id: bankId,
        opening_minor: "0",
        received_minor: "6000",
        spent_minor: "4800",
        transfers_in_minor: "0",
        transfers_out_minor: "0",
        closing_minor: "1200",
      },
    ];
    const config = packConfigSchema.parse({ basis: "cash", reports: [...PACK_REPORTS] });
    expect(config.basis).toBe("cash");
    const frozen = { ...base, cashSourceVersion: 1, cashSource: sourceSnapshot(input) };
    const pack = buildReportDocument(frozen, { name: "Cash management pack", config });
    expect(pack.basis).toBe("cash");
    expect(pack.sections.map((section) => section.id)).toEqual([...PACK_REPORTS]);
    expect(pack.sections[0]!.rows.find((row) => row.label === "Net profit")!.values).toEqual([
      "10.00",
      "0.00",
    ]);
    const cashFlow = pack.sections.find((section) => section.id === "cash-flow-indirect")!;
    expect(cashFlow.rows.at(-1)?.values).toEqual(["12.00"]);
    expect(() => buildReportDocument(base, { name: "Mislabelled pack", config })).toThrow(
      "Cash reports require captured cash settings",
    );
  });
});
