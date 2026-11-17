import { describe, expect, it } from "vitest";
import {
  reviewPostedGlEvidence,
  type GlAuditAccount,
  type GlAuditJournal,
  type GlAuditLine,
  type GlAuditPeriod,
  type GlAuditReversal,
} from "./posted-gl-evidence";

const company = "11111111-1111-4111-8111-111111111111";
const journal: GlAuditJournal = {
  id: "journal-1",
  company_id: company,
  journal_number: 37,
  journal_date: "2026-11-06",
  status: "posted",
  currency_code: "JPY",
  source_type: "payroll",
  reverses_journal_id: null,
  reversed_by_journal_id: null,
};
const lines: GlAuditLine[] = [
  {
    id: "l1",
    company_id: company,
    journal_id: journal.id,
    line_no: 1,
    account_id: "a1",
    debit_minor: "150",
    credit_minor: "0",
  },
  {
    id: "l2",
    company_id: company,
    journal_id: journal.id,
    line_no: 2,
    account_id: "a2",
    debit_minor: "0",
    credit_minor: "150",
  },
];
const accounts: GlAuditAccount[] = [
  { id: "a1", company_id: company, code: "6000", name: "Payroll expense" },
  { id: "a2", company_id: company, code: "2100", name: "Wages payable" },
];
const periods: GlAuditPeriod[] = [
  {
    id: "p1",
    company_id: company,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    status: "locked",
  },
];
function audit(
  j: GlAuditJournal = journal,
  l: GlAuditLine[] = lines,
  a: GlAuditAccount[] = accounts,
  p: GlAuditPeriod[] = periods,
  rev: GlAuditReversal[] = [],
) {
  return reviewPostedGlEvidence(company, j, l, a, p, rev);
}
describe("posted GL evidence reconciliation", () => {
  it("checks the original currency posted journal with account and locked-period evidence", () => {
    const result = audit();
    expect(result.status).toBe("passed");
    expect(result.currencyCode).toBe("JPY");
    expect(result.debitMinor).toBe("150");
    expect(result.creditMinor).toBe("150");
    expect(result.accountCount).toBe(2);
    expect(result.periodId).toBe("p1");
    expect(result.periodStatus).toBe("locked");
    expect(result.accounts[0]?.code).toBe("2100");
  });
  it("does not mark a draft as reconciled", () => {
    expect(audit({ ...journal, status: "draft" }, [], [], []).status).toBe("not_posted");
  });
  it("rejects a journal from another tenant", () => {
    expect(audit({ ...journal, company_id: "other" }).issues.join(" ")).toMatch(/organisation/);
  });
  it("fails closed when posted ledger lines are absent or incomplete", () => {
    expect(audit(journal, []).status).toBe("exceptions");
    expect(audit(journal, [lines[0]!]).issues.join(" ")).toMatch(/fewer than two/);
  });
  it("fails when an account is missing, cross-company or missing a code", () => {
    expect(audit(journal, lines, [accounts[0]!]).issues.join(" ")).toMatch(
      /valid organisation-owned account/,
    );
    expect(
      audit(journal, lines, [{ ...accounts[0]!, company_id: "other" }, accounts[1]!]).status,
    ).toBe("exceptions");
    expect(audit(journal, lines, [{ ...accounts[0]!, code: "" }, accounts[1]!]).status).toBe(
      "exceptions",
    );
  });
  it("requires exactly one covering financial year; locked years remain acceptable", () => {
    expect(audit(journal, lines, accounts, []).status).toBe("exceptions");
    expect(audit(journal, lines, accounts, [...periods, { ...periods[0]!, id: "p2" }]).status).toBe(
      "exceptions",
    );
    expect(audit(journal, lines, accounts, [{ ...periods[0]!, company_id: "other" }]).status).toBe(
      "exceptions",
    );
  });
  it("rejects duplicate IDs and invalid line numbers", () => {
    expect(
      audit(journal, [{ ...lines[0]! }, { ...lines[1]!, id: "l1", line_no: 1 }]).issues.join(" "),
    ).toMatch(/duplicate/);
  });
  it("rejects line/journal/tenant mismatch", () => {
    expect(audit(journal, [{ ...lines[0]!, journal_id: "other" }, lines[1]!]).status).toBe(
      "exceptions",
    );
    expect(audit(journal, [{ ...lines[0]!, company_id: "other" }, lines[1]!]).status).toBe(
      "exceptions",
    );
  });
  it("rejects one-sided, zero, and double-sided input", () => {
    expect(audit(journal, [{ ...lines[0]!, debit_minor: "0" }, lines[1]!]).status).toBe(
      "exceptions",
    );
    expect(
      audit(journal, [{ ...lines[0]!, credit_minor: "1" }, lines[1]!]).issues.join(" "),
    ).toMatch(/both or neither/);
  });
  it("catches unbalanced totals", () => {
    expect(
      audit(journal, [{ ...lines[0]!, debit_minor: "151" }, lines[1]!]).issues.join(" "),
    ).toMatch(/do not balance/);
  });
  it("does not round unsafe number or malformed database amount", () => {
    expect(
      audit(journal, [{ ...lines[0]!, debit_minor: Number.MAX_SAFE_INTEGER + 1 }, lines[1]!])
        .status,
    ).toBe("exceptions");
    expect(audit(journal, [{ ...lines[0]!, debit_minor: "0.01" }, lines[1]!]).status).toBe(
      "exceptions",
    );
  });
  it("preserves exact very large amounts passed as database integer text", () => {
    const huge = "9007199254740993";
    const result = audit(journal, [
      { ...lines[0]!, debit_minor: huge },
      { ...lines[1]!, credit_minor: huge },
    ]);
    expect(result.status).toBe("passed");
    expect(result.debitMinor).toBe(huge);
  });
  it("requires a valid reciprocal reversal link when reversal IDs are present", () => {
    const linked = { ...journal, reversed_by_journal_id: "reversal-1" };
    const related: GlAuditReversal[] = [
      {
        id: "reversal-1",
        company_id: company,
        status: "posted",
        reverses_journal_id: journal.id,
        reversed_by_journal_id: null,
      },
    ];
    expect(audit(linked, lines, accounts, periods, related).status).toBe("passed");
    expect(audit(linked).status).toBe("exceptions");
    expect(
      audit(linked, lines, accounts, periods, [{ ...related[0]!, status: "draft" }]).status,
    ).toBe("exceptions");
  });
  it("requires a valid original when this journal is a reversal", () => {
    const reversal = { ...journal, id: "reversal-1", reverses_journal_id: journal.id };
    const reversedLines = lines.map((l) => ({ ...l, journal_id: reversal.id }));
    const original: GlAuditReversal = {
      id: journal.id,
      company_id: company,
      status: "posted",
      reverses_journal_id: null,
      reversed_by_journal_id: reversal.id,
    };
    expect(audit(reversal, reversedLines, accounts, periods, [original]).status).toBe("passed");
    expect(audit(reversal, reversedLines, accounts, periods, []).status).toBe("exceptions");
  });
  it("rejects nonexistent calendar dates and missing journal source provenance", () => {
    expect(audit({ ...journal, journal_date: "2026-02-30" }).status).toBe("exceptions");
    expect(audit({ ...journal, source_type: "" }).status).toBe("exceptions");
    expect(audit({ ...journal, journal_number: 0 }).status).toBe("exceptions");
  });
  it("requires genuine financial periods and does not certify malformed evidence", () => {
    expect(
      audit(journal, lines, accounts, [{ ...periods[0]!, end_date: "2026-02-30" }]).status,
    ).toBe("exceptions");
    expect(audit(journal, lines, accounts, [{ ...periods[0]!, status: "" }]).status).toBe(
      "exceptions",
    );
  });
  it("detects unexpected account evidence in a bounded ledger review", () => {
    const extra: GlAuditAccount = {
      id: "a3",
      company_id: company,
      code: "9999",
      name: "Unexpected",
    };
    expect(audit(journal, lines, [...accounts, extra]).issues.join(" ")).toMatch(/unreferenced/);
  });
  it("never credits any unscoped reversal evidence as passing", () => {
    const linked = { ...journal, reversed_by_journal_id: "reversal-1" };
    const unrelated: GlAuditReversal = {
      id: "reversal-1",
      company_id: "other",
      status: "posted",
      reverses_journal_id: journal.id,
      reversed_by_journal_id: null,
    };
    expect(audit(linked, lines, accounts, periods, [unrelated]).status).toBe("exceptions");
  });
});
