import { describe, expect, it } from "vitest";
import { loadTaxFacts } from "./tax-return-data";
import { computeReturnTotals } from "./vat-return";

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the query builder used by loadTaxFacts. */
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(name: string) {
      let rows = [...(tables[name] ?? [])];
      const qb = {
        select: () => qb,
        eq: (c: string, v: unknown) => {
          rows = rows.filter((r) => r[c] === v);
          return qb;
        },
        in: (c: string, vs: unknown[]) => {
          rows = rows.filter((r) => vs.includes(r[c]));
          return qb;
        },
        gte: (c: string, v: unknown) => {
          rows = rows.filter((r) => String(r[c]) >= String(v));
          return qb;
        },
        lte: (c: string, v: unknown) => {
          rows = rows.filter((r) => String(r[c]) <= String(v));
          return qb;
        },
        order: () => qb,
        range: async (from: number, to: number) => ({
          data: rows.slice(from, to + 1),
          error: null,
        }),
      };
      return qb;
    },
  } as never;
}

const C = "co";
const baseTables = (): Record<string, Row[]> => ({
  tax_codes: [
    { id: "std", company_id: C, treatment: "standard", is_recoverable: true },
    { id: "rc", company_id: C, treatment: "reverse_charge", is_recoverable: true },
  ],
  sales_invoices: [
    {
      id: "inv1",
      company_id: C,
      invoice_date: "2026-09-10",
      currency_code: "GBP",
      status: "paid",
      posted_journal_id: "j1",
      total_minor: 12000,
    },
  ],
  sales_invoice_lines: [
    {
      id: "l1",
      company_id: C,
      invoice_id: "inv1",
      net_minor: 10000,
      tax_minor: 2000,
      tax_code_id: "std",
    },
  ],
  sales_receipts: [
    {
      id: "r1",
      company_id: C,
      status: "posted",
      posted_journal_id: "jr1",
      receipt_date: "2026-10-05",
    },
  ],
  sales_receipt_allocations: [
    { id: "a1", company_id: C, invoice_id: "inv1", receipt_id: "r1", amount_minor: 12000 },
  ],
  purchase_bills: [
    {
      id: "b1",
      company_id: C,
      bill_date: "2026-10-02",
      currency_code: "GBP",
      status: "authorised",
      posted_journal_id: "j2",
      total_minor: 10000,
    },
  ],
  purchase_bill_lines: [
    {
      id: "bl1",
      company_id: C,
      bill_id: "b1",
      net_minor: 10000,
      tax_minor: 0,
      tax_code_id: "rc",
      tax_rate_bps: 2000,
    },
  ],
});

describe("loadTaxFacts", () => {
  it("self-assesses reverse charge on bills into output and input tax", async () => {
    const r = await loadTaxFacts(fakeDb(baseTables()), {
      companyId: C,
      from: "2026-10-01",
      to: "2026-10-31",
      basis: "accrual",
      baseCurrency: "GBP",
    });
    const totals = computeReturnTotals(r.facts);
    // The September invoice is outside an accrual October return.
    expect(totals.outputTax).toBe(2000n);
    expect(totals.inputTax).toBe(2000n);
    expect(totals.netTax).toBe(0n);
    expect(totals.counts.selfAssessed).toBe(1);
  });

  it("cash basis takes the invoice in the month it is paid", async () => {
    const accrual = await loadTaxFacts(fakeDb(baseTables()), {
      companyId: C,
      from: "2026-09-01",
      to: "2026-09-30",
      basis: "accrual",
      baseCurrency: "GBP",
    });
    expect(computeReturnTotals(accrual.facts).outputTax).toBe(2000n);

    const cashSep = await loadTaxFacts(fakeDb(baseTables()), {
      companyId: C,
      from: "2026-09-01",
      to: "2026-09-30",
      basis: "cash",
      baseCurrency: "GBP",
    });
    expect(computeReturnTotals(cashSep.facts).outputTax).toBe(0n);

    const cashOct = await loadTaxFacts(fakeDb(baseTables()), {
      companyId: C,
      from: "2026-10-01",
      to: "2026-10-31",
      basis: "cash",
      baseCurrency: "GBP",
    });
    const t = computeReturnTotals(cashOct.facts);
    // Invoice VAT 2000 (paid in October) + reverse charge 2000 (bill has no payment yet,
    // so on cash basis it is not counted until paid).
    expect(t.outputTax).toBe(2000n);
    expect(t.inputTax).toBe(0n);
  });

  it("legacy reverse-charge bills that carry tax stay input-only", async () => {
    const t = baseTables();
    t["purchase_bill_lines"] = [
      {
        id: "bl1",
        company_id: C,
        bill_id: "b1",
        net_minor: 10000,
        tax_minor: 2000,
        tax_code_id: "rc",
        tax_rate_bps: 2000,
      },
    ];
    const r = await loadTaxFacts(fakeDb(t), {
      companyId: C,
      from: "2026-10-01",
      to: "2026-10-31",
      basis: "accrual",
      baseCurrency: "GBP",
    });
    const totals = computeReturnTotals(r.facts);
    expect(totals.outputTax).toBe(0n + 0n);
    expect(totals.inputTax).toBe(2000n);
  });
});

const cashPeriod = (tables: Record<string, Row[]>, month: string) =>
  loadTaxFacts(fakeDb(tables), {
    companyId: C,
    from: `2026-${month}-01`,
    to: `2026-${month}-${month === "09" || month === "11" ? "30" : "31"}`,
    basis: "cash",
    baseCurrency: "GBP",
  });

describe("cash tax settlement history", () => {
  it("allocates cumulative tax pennies exactly once across periods", async () => {
    const t = baseTables();
    t["sales_invoices"]![0]!["total_minor"] = 3;
    t["sales_invoice_lines"]![0]!["net_minor"] = 2;
    t["sales_invoice_lines"]![0]!["tax_minor"] = 1;
    t["sales_receipts"] = ["09", "10", "11"].map((month) => ({
      id: month,
      company_id: C,
      status: "posted",
      posted_journal_id: `jr${month}`,
      receipt_date: `2026-${month}-15`,
    }));
    t["sales_receipt_allocations"] = ["09", "10", "11"].map((month) => ({
      id: month,
      company_id: C,
      receipt_id: month,
      invoice_id: "inv1",
      amount_minor: 1,
    }));
    const totals = await Promise.all(
      ["09", "10", "11"].map(async (month) =>
        computeReturnTotals((await cashPeriod(t, month)).facts),
      ),
    );
    expect(totals.map((r) => r.outputTax)).toEqual([0n, 1n, 0n]);
    expect(totals.reduce((sum, r) => sum + r.salesNet, 0n)).toBe(2n);
  });

  it("retains original receipt tax and reverses only on the later void date", async () => {
    const t = baseTables();
    Object.assign(t["sales_receipts"]![0]!, { status: "void", void_journal_id: "void" });
    t["sales_receipt_allocations"]![0]!["reversed_on"] = "2026-11-12";
    t["journals"] = [{ id: "void", company_id: C, status: "posted", journal_date: "2026-11-12" }];
    expect(computeReturnTotals((await cashPeriod(t, "10")).facts).outputTax).toBe(2000n);
    expect(computeReturnTotals((await cashPeriod(t, "11")).facts).outputTax).toBe(-2000n);
  });

  it("does not tax an advance until it is allocated", async () => {
    const t = baseTables();
    t["sales_receipt_allocations"]![0]!["allocated_on"] = "2026-11-12";
    expect(computeReturnTotals((await cashPeriod(t, "10")).facts).outputTax).toBe(0n);
    expect(computeReturnTotals((await cashPeriod(t, "11")).facts).outputTax).toBe(2000n);
    t["sales_receipt_allocations"] = [];
    expect(computeReturnTotals((await cashPeriod(t, "11")).facts).outputTax).toBe(0n);
  });

  it.each([
    ["sales", "customer_refund", "outputTax"],
    ["purchase", "supplier_refund", "inputTax"],
  ] as const)("recognizes %s credit tax only when refunded", async (prefix, kind, field) => {
    const t = baseTables();
    t["sales_receipts"] = [];
    t[`${prefix}_credit_notes`] = [
      {
        id: "credit",
        company_id: C,
        credit_date: "2026-09-01",
        currency_code: "GBP",
        status: "authorised",
        posted_journal_id: "creditj",
        total_minor: 12000,
      },
    ];
    t[`${prefix}_credit_note_lines`] = [
      {
        id: "creditline",
        company_id: C,
        credit_note_id: "credit",
        net_minor: 10000,
        tax_minor: 2000,
      },
    ];
    t["money_documents"] = [
      {
        id: "refund",
        company_id: C,
        kind,
        status: "posted",
        posted_journal_id: "refundj",
        document_date: "2026-11-12",
      },
    ];
    t["money_document_credit_uses"] = [
      {
        id: "use",
        company_id: C,
        document_id: "refund",
        source_kind: `${prefix}_credit_note`,
        source_id: "credit",
        amount_minor: 6000,
      },
    ];
    expect(computeReturnTotals((await cashPeriod(t, "09")).facts)[field]).toBe(0n);
    expect(computeReturnTotals((await cashPeriod(t, "11")).facts)[field]).toBe(-1000n);
    t["money_document_credit_uses"] = [];
    expect(computeReturnTotals((await cashPeriod(t, "11")).facts)[field]).toBe(0n);
  });

  it("restores an archived supplier allocation on the original date and reverses the void", async () => {
    const t = baseTables();
    t["sales_receipts"] = [];
    t["purchase_bills"]![0]!["total_minor"] = 12000;
    Object.assign(t["purchase_bill_lines"]![0]!, {
      net_minor: 10000,
      tax_minor: 2000,
      tax_code_id: "std",
    });
    t["supplier_payments"] = [
      {
        id: "p",
        company_id: C,
        status: "void",
        posted_journal_id: "pj",
        void_journal_id: "pv",
        payment_date: "2026-10-05",
      },
    ];
    t["journals"] = [{ id: "pv", company_id: C, status: "posted", journal_date: "2026-11-12" }];
    t["cash_allocation_history"] = [
      {
        id: "history",
        company_id: C,
        allocation_id: "pa",
        source_table: "supplier_payment_allocations",
        operation: "DELETE",
        source_row: {
          id: "pa",
          company_id: C,
          payment_id: "p",
          bill_id: "b1",
          amount_minor: "6000",
        },
      },
    ];
    expect(computeReturnTotals((await cashPeriod(t, "10")).facts).inputTax).toBe(1000n);
    expect(computeReturnTotals((await cashPeriod(t, "11")).facts).inputTax).toBe(-1000n);
  });

  it("rejects unsafe or excessive allocations", async () => {
    const t = baseTables();
    t["sales_receipt_allocations"]![0]!["amount_minor"] = 12001;
    await expect(cashPeriod(t, "10")).rejects.toThrow("exceed");
    t["sales_receipt_allocations"]![0]!["amount_minor"] = Number.MAX_SAFE_INTEGER + 1;
    await expect(cashPeriod(t, "10")).rejects.toThrow("unsafe tax amount");
  });
});

it("retains and reverses archived credit-refund tax without taxing returned advances", async () => {
  const t = baseTables();
  t["sales_receipts"] = [];
  t["sales_credit_notes"] = [
    {
      id: "credit",
      company_id: C,
      credit_date: "2026-09-01",
      currency_code: "GBP",
      status: "authorised",
      posted_journal_id: "creditj",
      total_minor: 12000,
    },
  ];
  t["sales_credit_note_lines"] = [
    {
      id: "creditline",
      company_id: C,
      credit_note_id: "credit",
      net_minor: 10000,
      tax_minor: 2000,
    },
  ];
  t["money_documents"] = [
    {
      id: "refund",
      company_id: C,
      kind: "customer_refund",
      status: "void",
      posted_journal_id: "refundj",
      void_journal_id: "refundv",
      document_date: "2026-10-12",
    },
  ];
  t["journals"] = [{ id: "refundv", company_id: C, status: "posted", journal_date: "2026-11-12" }];
  t["cash_allocation_history"] = [
    {
      id: "history",
      company_id: C,
      source_table: "money_document_credit_uses",
      operation: "DELETE",
      source_row: {
        id: "use",
        company_id: C,
        document_id: "refund",
        source_kind: "sales_credit_note",
        source_id: "credit",
        amount_minor: "6000",
      },
    },
  ];
  expect(computeReturnTotals((await cashPeriod(t, "10")).facts).outputTax).toBe(-1000n);
  expect(computeReturnTotals((await cashPeriod(t, "11")).facts).outputTax).toBe(1000n);
  t["cash_allocation_history"]![0]!["source_row"] = {
    id: "use",
    company_id: C,
    document_id: "refund",
    source_kind: "sales_receipt",
    source_id: "advance",
    amount_minor: "6000",
  };
  expect(computeReturnTotals((await cashPeriod(t, "10")).facts).outputTax).toBe(0n);
});

it("cash tax drill facts carry each payment date and sum to the same return totals", async () => {
  const t = baseTables();
  t["sales_receipts"] = [
    {
      id: "r1",
      company_id: C,
      status: "posted",
      posted_journal_id: "j1",
      receipt_date: "2026-10-05",
    },
    {
      id: "r2",
      company_id: C,
      status: "posted",
      posted_journal_id: "j2",
      receipt_date: "2026-11-05",
    },
  ];
  t["sales_receipt_allocations"] = [
    { id: "a1", company_id: C, receipt_id: "r1", invoice_id: "inv1", amount_minor: 6000 },
    { id: "a2", company_id: C, receipt_id: "r2", invoice_id: "inv1", amount_minor: 6000 },
  ];
  const result = await loadTaxFacts(fakeDb(t), {
    companyId: C,
    from: "2026-10-01",
    to: "2026-11-30",
    basis: "cash",
    baseCurrency: "GBP",
  });
  expect(result.facts.map((f) => f.source)).toEqual([
    { type: "sales_invoice", id: "inv1", lineId: "l1", date: "2026-10-05", settlementId: "a1" },
    { type: "sales_invoice", id: "inv1", lineId: "l1", date: "2026-11-05", settlementId: "a2" },
  ]);
  expect(result.facts.map((f) => computeReturnTotals([f]).outputTax)).toEqual([1000n, 1000n]);
  expect(computeReturnTotals(result.facts).outputTax).toBe(2000n);
});

it("reverses the exact original tax penny and reuses that slice on reallocation", async () => {
  const t = baseTables();
  t["sales_invoices"]![0]!["total_minor"] = 3;
  t["sales_invoice_lines"]![0]!["net_minor"] = 2;
  t["sales_invoice_lines"]![0]!["tax_minor"] = 1;
  t["sales_receipts"] = ["r1", "r2", "r3"].map((id) => ({
    id,
    company_id: C,
    status: "posted",
    posted_journal_id: `j${id}`,
    receipt_date: "2026-10-05",
  }));
  t["sales_receipt_allocations"] = [
    {
      id: "a1",
      company_id: C,
      receipt_id: "r1",
      invoice_id: "inv1",
      amount_minor: 1,
      allocated_on: "2026-10-05",
      reversed_on: "2026-11-05",
    },
    {
      id: "a2",
      company_id: C,
      receipt_id: "r2",
      invoice_id: "inv1",
      amount_minor: 1,
      allocated_on: "2026-10-06",
    },
    {
      id: "a3",
      company_id: C,
      receipt_id: "r3",
      invoice_id: "inv1",
      amount_minor: 1,
      allocated_on: "2026-11-06",
    },
  ];
  const nov = await cashPeriod(t, "11");
  expect(nov.facts.map((f) => [f.source?.settlementId, f.taxBase])).toEqual([
    ["a1:reversal", 0n],
    ["a3", 0n],
  ]);
  expect(computeReturnTotals((await cashPeriod(t, "10")).facts).outputTax).toBe(1n);
  expect(computeReturnTotals(nov.facts).outputTax).toBe(0n);
});

it("reuses dated supplier allocation versions for historical cash tax", async () => {
  const t = baseTables();
  t["sales_receipts"] = [];
  t["purchase_bills"]![0]!["total_minor"] = 12000;
  Object.assign(t["purchase_bill_lines"]![0]!, {
    net_minor: 10000,
    tax_minor: 2000,
    tax_code_id: "std",
  });
  t["supplier_payments"] = [
    { id: "p", company_id: C, status: "paid", posted_journal_id: "pj", payment_date: "2026-10-05" },
  ];
  t["supplier_payment_allocations"] = [
    {
      id: "pa",
      company_id: C,
      payment_id: "p",
      bill_id: "b1",
      amount_minor: "12000",
      allocated_on: "2026-10-05",
    },
  ];
  t["cash_allocation_history"] = [
    {
      id: "history",
      company_id: C,
      allocation_id: "pa",
      source_table: "supplier_payment_allocations",
      operation: "UPDATE",
      recorded_at: "2026-11-12T10:00:00Z",
      event_seq: "1",
      source_row: {
        id: "pa",
        company_id: C,
        payment_id: "p",
        bill_id: "b1",
        amount_minor: "6000",
        allocated_on: "2026-10-05",
      },
    },
  ];
  expect(computeReturnTotals((await cashPeriod(t, "10")).facts).inputTax).toBe(1000n);
  expect(computeReturnTotals((await cashPeriod(t, "11")).facts).inputTax).toBe(1000n);
});

it("orders same-day void and replacement allocations by their source dependency", async () => {
  const t = baseTables();
  t["sales_receipt_allocations"] = [
    {
      id: "a-new",
      company_id: C,
      receipt_id: "r1",
      invoice_id: "inv1",
      amount_minor: 12000,
      allocated_on: "2026-10-05",
    },
    {
      id: "z-old",
      company_id: C,
      receipt_id: "r1",
      invoice_id: "inv1",
      amount_minor: 12000,
      allocated_on: "2026-10-05",
      reversed_on: "2026-10-05",
    },
  ];
  const result = await cashPeriod(t, "10");
  expect(computeReturnTotals(result.facts).outputTax).toBe(2000n);
  expect(result.facts.map((f) => f.source?.settlementId)).toEqual([
    "z-old",
    "z-old:reversal",
    "a-new",
  ]);
});

function importedTaxTables() {
  const t = baseTables();
  t.sales_invoice_lines = [];
  t.journals = [
    {
      id: "j1",
      company_id: C,
      journal_date: "2026-09-01",
      journal_number: "opening",
      currency_code: "GBP",
      fx_rate_to_base: "1",
      source_type: "opening_balance",
      source_id: null,
      status: "posted",
    },
  ];
  t.journal_lines = [
    {
      id: "opening-ar",
      company_id: C,
      journal_id: "j1",
      account_id: "ar",
      debit_minor: "12000",
      credit_minor: "0",
    },
    {
      id: "opening-equity",
      company_id: C,
      journal_id: "j1",
      account_id: "equity",
      debit_minor: "0",
      credit_minor: "12000",
    },
  ];
  t.cash_opening_evidence = [
    {
      id: "approved-opening",
      status: "approved",
      company_id: C,
      document_id: "inv1",
      source_kind: "sales_invoice",
      posted_journal_id: "j1",
      currency_code: "GBP",
      gross_minor: "12000",
      version: 1,
      effective_from: "2026-09-01",
      mode: "recognize_on_settlement",
      approved_by: "reviewer",
      approved_at: "2026-10-01",
      tax_lines: [
        { id: "original-line", net_minor: "10000", tax_minor: "2000", tax_code_id: "std" },
      ],
      source_journal_snapshot: {
        id: "j1",
        company_id: C,
        journal_date: "2026-09-01",
        currency_code: "GBP",
        fx_rate_to_base: "1.00000000",
        source_type: "opening_balance",
        source_id: null,
        status: "posted",
        lines: t.journal_lines.map((l) => ({
          id: l.id,
          account_id: l.account_id,
          debit_minor: l.debit_minor,
          credit_minor: l.credit_minor,
        })),
      },
    },
  ];
  return t;
}
it("uses approved original opening tax evidence on actual cash dates", async () => {
  const t = importedTaxTables();
  expect(computeReturnTotals((await cashPeriod(t, "10")).facts).outputTax).toBe(2000n);
  expect(computeReturnTotals((await cashPeriod(t, "11")).facts).outputTax).toBe(0n);
});
it("does not repeat tax already recognized before conversion", async () => {
  const t = importedTaxTables();
  t.cash_opening_evidence![0]!.mode = "already_recognized";
  expect(computeReturnTotals((await cashPeriod(t, "10")).facts).outputTax).toBe(0n);
});
it.each(["missing", "drift", "tax-code"])(
  "reports unresolved opening tax evidence: %s",
  async (kind) => {
    const t = importedTaxTables();
    if (kind === "missing") t.cash_opening_evidence = [];
    if (kind === "drift") t.journal_lines![0]!.debit_minor = "12001";
    if (kind === "tax-code")
      (t.cash_opening_evidence![0]!.tax_lines as Row[])[0]!.tax_code_id = "foreign-code";
    await expect(cashPeriod(t, "10")).rejects.toThrow("CASH_CLASSIFICATION_EXCEPTION:");
  },
);
it("requires the verified historical reverse-charge rate instead of today's code rate", async () => {
  const t = importedTaxTables();
  t.sales_receipts = [];
  t.purchase_bill_lines = [];
  t.purchase_bills![0]!.posted_journal_id = "j1";
  t.supplier_payments = [
    { id: "p", company_id: C, status: "paid", posted_journal_id: "pj", payment_date: "2026-10-05" },
  ];
  t.supplier_payment_allocations = [
    {
      id: "pa",
      company_id: C,
      payment_id: "p",
      bill_id: "b1",
      amount_minor: "10000",
      allocated_on: "2026-10-05",
    },
  ];
  Object.assign(t.cash_opening_evidence![0]!, {
    document_id: "b1",
    source_kind: "purchase_bill",
    gross_minor: "10000",
    tax_lines: [{ id: "historical", net_minor: "10000", tax_minor: "0", tax_code_id: "rc" }],
  });
  t.tax_codes!.find((c) => c.id === "rc")!.tax_rates = { rate_bps: 5000 };
  await expect(cashPeriod(t, "10")).rejects.toThrow("Original reverse-charge rate evidence");
  (t.cash_opening_evidence![0]!.tax_lines as Row[])[0]!.tax_rate_bps = 2000;
  const result = computeReturnTotals((await cashPeriod(t, "10")).facts);
  expect(result.inputTax).toBe(2000n);
  expect(result.outputTax).toBe(2000n);
});
it("reports missing foreign source FX instead of omitting material cash tax", async () => {
  const t = baseTables();
  t.sales_invoices![0]!.currency_code = "USD";
  await expect(cashPeriod(t, "10")).rejects.toThrow("cash_tax_fx_evidence_required");
});
