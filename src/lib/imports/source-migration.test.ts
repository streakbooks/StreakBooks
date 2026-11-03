import { describe, expect, it } from "vitest";
import { getImportDefinition } from "./import-definitions";
import {
  mapMigrationCsv,
  migrationHeaders,
  migrationValidationReport,
  suggestMigrationMapping,
  validateMigrationCsv,
  validateSourceFinancialSemantics,
} from "./source-migration";
import { parseImportCsv } from "./import-preflight";

const def = getImportDefinition("sales", "Invoices");
const headers = [
  "InvoiceNumber",
  "ContactName",
  "InvoiceDate",
  "DueDate",
  "AccountCode",
  "Description",
  "Quantity",
  "UnitAmount",
  "TaxType",
];
const source =
  headers.join(",") +
  '\nINV-1,+Partners,01/02/2026,28/02/2026,4000,"Work, phase 1",1,100.00,GST10\n';
const mapping = suggestMigrationMapping(headers, def);
const mapped = () => mapMigrationCsv(source, def, mapping, "DMY");

describe("source migration financial safety", () => {
  it("maps a Xero-style line export and preserves contact identity and quoted text", () => {
    const csv = mapped();
    expect(parseImportCsv(csv)[1]).toEqual([
      "INV-1",
      "+Partners",
      "2026-02-01",
      "2026-02-28",
      "4000",
      "Work, phase 1",
      "1",
      "100.00",
      "GST10",
    ]);
    expect(() => validateMigrationCsv(csv, def, "USD")).not.toThrow();
  });
  it("does not guess ambiguous day/month dates", () => {
    expect(() => mapMigrationCsv(source, def, mapping, "ISO")).toThrow(
      /select the source date format/,
    );
    expect(() =>
      validateMigrationCsv(mapMigrationCsv(source, def, mapping, "MDY"), def, "USD"),
    ).toThrow(/invalid due date/);
  });
  it("rejects impossible dates, negative prices and excess precision before writes", () => {
    for (const [from, to] of [
      ["28/02/2026", "31/02/2026"],
      ["100.00", "-100.00"],
      ["100.00", "100.001"],
    ]) {
      expect(() =>
        validateMigrationCsv(
          mapMigrationCsv(source.replace(from!, to!), def, mapping, "DMY"),
          def,
          "USD",
        ),
      ).toThrow();
    }
  });
  it("rejects missing required mappings, reused columns and stale mappings", () => {
    expect(() => mapMigrationCsv(source, def, { ...mapping, customer: "" }, "DMY")).toThrow(
      /required/,
    );
    expect(() =>
      mapMigrationCsv(source, def, { ...mapping, customer: "InvoiceNumber" }, "DMY"),
    ).toThrow(/more than once/);
    expect(() => mapMigrationCsv(source, def, { ...mapping, customer: "Gone" }, "DMY")).toThrow(
      /no longer exists/,
    );
  });
  it("rejects malformed files, normalized duplicate headings and empty files", () => {
    for (const text of [
      "Name,Name\nx,y",
      "Invoice No,InvoiceNo\nx,y",
      "Name\n",
      "Name,Date\nx",
      'Name\n"unclosed',
    ])
      expect(() => migrationHeaders(text)).toThrow();
  });
  it("leaves ambiguous aliases for review", () => {
    expect(suggestMigrationMapping(["ContactName", "CustomerName"], def)["customer"]).toBe("");
  });
  it("groups multi-line invoices but rejects inconsistent document headers", () => {
    const line = source.split("\n")[1]!;
    expect(() =>
      validateMigrationCsv(mapMigrationCsv(source + line + "\n", def, mapping, "DMY"), def, "USD"),
    ).not.toThrow();
    expect(() =>
      validateMigrationCsv(
        mapMigrationCsv(source + line.replace("+Partners", "Other") + "\n", def, mapping, "DMY"),
        def,
        "USD",
      ),
    ).toThrow();
  });
  it("enforces server invoice identifier length and row limits", () => {
    expect(() =>
      validateMigrationCsv(mapped().replace("INV-1", "I".repeat(41)), def, "USD"),
    ).toThrow(/40/);
    const rows = mapped().split("\r\n");
    expect(() =>
      validateMigrationCsv(rows[0] + "\n" + Array(251).fill(rows[1]).join("\n"), def, "USD"),
    ).toThrow(/maximum import rows/);
  });
  it("blocks known lossy foreign currency, paid, discount and inclusive-tax exports", () => {
    for (const [header, value] of [
      ["Currency", "EUR"],
      ["AmountPaid", "50"],
      ["Discount", "10%"],
      ["TaxInclusive", "true"],
      ["LineAmountTypes", "Inclusive"],
    ]) {
      expect(() => validateSourceFinancialSemantics(`${header}\n${value}`, "USD")).toThrow();
    }
    expect(() =>
      validateSourceFinancialSemantics("Currency,Discount,TaxInclusive\nUSD,0.00,false", "USD"),
    ).not.toThrow();
  });
  it("exports honest, spreadsheet-safe validation evidence", () => {
    const report = migrationValidationReport(
      "Xero",
      "=cmd()",
      def,
      mapping,
      "Bad date",
      "company",
      "USD",
    );
    expect(report).toContain("BLOCKED");
    expect(report).toContain("NOT PERFORMED");
    expect(report).toContain("'=cmd()");
  });
});
