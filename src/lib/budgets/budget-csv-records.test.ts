import { describe, expect, it } from "vitest";
import { parseBudgetCsvRecords } from "./budget-csv-records";

describe("budget CSV RFC 4180 record parsing", () => {
  it("keeps quoted commas, escaped quotes and multiline names in one record", () => {
    const records = parseBudgetCsvRecords(
      '"Account code","Account name","Jan"\r\n' +
      '"400","Cafe,\r\n""North"" branch","120.00"\r\n',
    );
    expect(records).toEqual([
      { cells: ["Account code","Account name","Jan"], row: 1 },
      { cells: ["400",'Cafe,\n"North" branch',"120.00"], row: 2 },
    ]);
  });

  it("recognises report metadata with multiline quoted organisation names", () => {
    const records = parseBudgetCsvRecords(
      '"Company","Example\nGroup"\n\n"Account code","Account name"\n"400","Sales"',
    );
    expect(records.map(row => row.row)).toEqual([1, 4, 5]);
    expect(records[0]?.cells[1]).toBe("Example\nGroup");
  });

  it("handles UTF-8 BOM, LF, CRLF and bare CR without shifting fields", () => {
    const records = parseBudgetCsvRecords('\uFEFF"a","b"\n"c","d"\r\n"e","f"\r"g","h"');
    expect(records.map(row => row.cells)).toEqual([
      ["a","b"],["c","d"],["e","f"],["g","h"],
    ]);
    expect(records.map(row => row.row)).toEqual([1, 2, 3, 4]);
  });

  it("supports empty quoted fields and a final trailing comma", () => {
    expect(parseBudgetCsvRecords('"",""\n"a",').map(row => row.cells)).toEqual([
      ["",""],["a",""],
    ]);
  });

  it("rejects unterminated quotations before any budget change", () => {
    expect(() => parseBudgetCsvRecords('"400","Sales\nEast')).toThrow(
      /Unterminated quoted CSV field beginning on line 1/,
    );
  });

  it("rejects stray quote characters and invalid text after closed quotes", () => {
    expect(() => parseBudgetCsvRecords('400,Sa"les')).toThrow(
      /Malformed CSV quotation mark on line 1/,
    );
    expect(() => parseBudgetCsvRecords('"400"broken,Sales')).toThrow(
      /Unexpected text after closing CSV quote on line 1/,
    );
  });

  it("does not mistake quoted line breaks for new budget rows", () => {
    const records = parseBudgetCsvRecords(
      '"400","Sales\nNorth",100\n"500","Rent",50\n',
    );
    expect(records).toHaveLength(2);
    expect(records[1]?.row).toBe(3);
  });
});
