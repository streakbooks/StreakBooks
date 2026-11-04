import { describe, expect, it } from "vitest";
import {
  importJournalLinesCsv,
  parseCsvCells,
  type JournalImportAccount,
} from "./journal-csv-import";

const accounts: JournalImportAccount[] = [
  { id: "expense-id", code: "500", is_active: true, is_postable: true, is_control: false },
  { id: "accrual-id", code: "210", is_active: true, is_postable: true, is_control: false },
  { id: "control-id", code: "200", is_active: true, is_postable: true, is_control: true },
  { id: "closed-id", code: "999", is_active: false, is_postable: true, is_control: false },
];

const goodCsv =
  "account_code,description,debit,credit\r\n500,Accrual,100.00,\r\n210,Accrual,,100.00\r\n";

describe("manual journal CSV import", () => {
  it("handles BOM, quoted commas, multiline cells and escaped quotes", () => {
    expect(parseCsvCells('\uFEFFcode,description\n500,"A ""quoted"",\nvalue"\n')).toEqual([
      ["code", "description"],
      ["500", 'A "quoted",\nvalue'],
    ]);
  });

  it("maps posting account codes and holds the balanced journal as a draft only", () => {
    const original = JSON.stringify(accounts);
    expect(importJournalLinesCsv(goodCsv, accounts, "GBP")).toEqual([
      { accountId: "expense-id", description: "Accrual", debit: "100.00", credit: "0" },
      { accountId: "accrual-id", description: "Accrual", debit: "0", credit: "100.00" },
    ]);
    expect(JSON.stringify(accounts)).toBe(original);
  });

  it("rejects mismatched or incomplete CSV headers and malformed quotations", () => {
    expect(() => importJournalLinesCsv("code,debit,credit\n", accounts, "GBP")).toThrow(
      "Expected CSV columns",
    );
    expect(() => parseCsvCells('code,description\n500,"unclosed')).toThrow(
      "Unclosed quoted",
    );
    expect(() => parseCsvCells('code,description\n500,bad"quote')).toThrow(
      "Malformed CSV",
    );
  });

  it("rejects unknown, inactive, control or ambiguous ledger accounts", () => {
    for (const code of ["888", "999", "200"]) {
      expect(() =>
        importJournalLinesCsv(goodCsv.replace("500,Accrual", code + ",Accrual"), accounts, "GBP"),
      ).toThrow("not allowed");
    }
    expect(() =>
      importJournalLinesCsv(goodCsv, [...accounts, { ...accounts[0]!, id: "duplicate-code" }], "GBP"),
    ).toThrow("ambiguous");
  });

  it("rejects unbalanced journals, non-decimals, both-sided entries, and zero lines", () => {
    expect(() => importJournalLinesCsv(goodCsv.replace("100.00", "99.00"), accounts, "GBP")).toThrow(
      "must balance",
    );
    expect(() => importJournalLinesCsv(goodCsv.replace("100.00", "1e2"), accounts, "GBP")).toThrow(
      "non-negative decimal",
    );
    expect(() =>
      importJournalLinesCsv(goodCsv.replace("500,Accrual,100.00,", "500,Accrual,100.00,10.00"), accounts, "GBP"),
    ).toThrow("exactly one");
    expect(() => importJournalLinesCsv(goodCsv.replace("500,Accrual,100.00,", "500,Accrual,0,"), accounts, "GBP")).toThrow(
      "exactly one",
    );
  });

  it("never silently rounds currency minor units or converts unsafe numbers", () => {
    expect(() => importJournalLinesCsv(goodCsv.replace("100.00", "100.001"), accounts, "GBP")).toThrow(
      "decimal precision",
    );
    expect(() =>
      importJournalLinesCsv(
        "account_code,description,debit,credit\n500,Accrual,90071992547409.92,\n210,Accrual,,90071992547409.92",
        accounts,
        "GBP",
      ),
    ).toThrow("safe integer");
    expect(() => importJournalLinesCsv(goodCsv, accounts, "JPY")).toThrow(
      "decimal precision",
    );
  });

  it("restricts imports to one 2–200 line manual journal and bounded file input", () => {
    expect(() =>
      importJournalLinesCsv("account_code,description,debit,credit\n500,Only one,1,", accounts, "GBP"),
    ).toThrow("2 to 200");
    expect(() => parseCsvCells("a".repeat(256001))).toThrow("256 KB");
    expect(() => parseCsvCells("a\n".repeat(202))).toThrow("at most 200");
  });
});
