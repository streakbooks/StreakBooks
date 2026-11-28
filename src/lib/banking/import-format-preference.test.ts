import { describe, expect, it } from "vitest";
import {
  bankImportAcceptAttribute,
  bankImportFormatForFilename,
  bankImportFormatLabel,
  enabledBankImportFormats,
} from "./import-format-preference";

describe("bank import format preference", () => {
  it("defaults to all formats handled by the current importer and filters unavailable formats", () => {
    expect(enabledBankImportFormats(null)).toEqual(["csv", "ofx", "qif"]);
    expect(enabledBankImportFormats({ import_formats: ["ofx", "mt940"] })).toEqual(["ofx"]);
    expect(enabledBankImportFormats({ import_formats: ["ofx", "unknown"] })).toEqual(["ofx"]);
    expect(enabledBankImportFormats({ import_formats: "csv" })).toEqual([]);
    expect(enabledBankImportFormats({ import_formats: [] })).toEqual([]);
    expect(enabledBankImportFormats({ import_formats: ["mt940", "camt"] })).toEqual([]);
  });

  it("maps file extensions to the parser selected by the organisation", () => {
    expect(bankImportFormatForFilename("statement.TXT")).toBe("csv");
    expect(bankImportFormatForFilename("statement.qfx")).toBe("ofx");
    expect(bankImportFormatForFilename("statement.qif")).toBe("qif");
    expect(bankImportFormatForFilename("statement.pdf")).toBeNull();
    expect(bankImportAcceptAttribute(["csv", "qif"])).toBe(".csv,.txt,.qif");
    expect(bankImportFormatLabel(["csv", "qif"])).toBe("CSV/TXT, QIF");
  });
});
