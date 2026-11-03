import { describe, expect, it } from "vitest";
import { parseOfxStatement, OFX_MAPPING } from "./ofx-import";
import { applyMapping, parseCsvText, assignExternalIds } from "./csv-mapping";
const transaction = (id = "fit-1", amount = "-12.34", date = "20261103120000.000[0:GMT]") =>
  `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${date}<TRNAMT>${amount}<FITID>${id}<NAME>A &amp; B<MEMO>Office supplies<CHECKNUM>007</STMTTRN>`;
const statement = (body = transaction()) =>
  `OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>GBP<BANKACCTFROM><ACCTID>12345678</BANKACCTFROM><BANKTRANLIST>${body}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
describe("OFX/QFX statement intake", () => {
  it("parses SGML through the existing CSV preview pipeline with signed integer amounts and bank FITIDs", () => {
    const result = parseOfxStatement(statement());
    expect(result.currency).toBe("GBP");
    expect(result.accountId).toBe("12345678");
    const mapped = applyMapping(parseCsvText(result.csvText).rows, OFX_MAPPING, "GBP");
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows).toHaveLength(1);
    expect(mapped.rows[0]).toEqual(
      expect.objectContaining({ txnDate: "2026-11-03", amountMinor: -1234n, bankId: "fit-1" }),
    );
    expect(result.csvText).toContain("A & B");
    expect(result.csvText).toContain("007");
  });
  it("accepts XML and credit-card responses without executing XML", () => {
    const xml = statement(transaction())
      .replace("<STMTRS>", "<CCSTMTRS>")
      .replace("</STMTRS>", "</CCSTMTRS>")
      .replace("<CURDEF>GBP", "<CURDEF>GBP</CURDEF>");
    expect(parseOfxStatement(xml).transactionCount).toBe(1);
  });
  it("keeps identity stable when the same statement is uploaded again", async () => {
    const a = parseOfxStatement(statement());
    const rows = applyMapping(parseCsvText(a.csvText).rows, OFX_MAPPING, "GBP").rows;
    expect(await assignExternalIds(rows, "bank-a")).toEqual(
      await assignExternalIds(rows, "bank-a"),
    );
  });
  it.each([
    statement(transaction("same") + transaction("same")),
    statement(transaction("too-precise", "1.234")),
    statement(transaction("x".repeat(121))),
    statement(transaction("", "2")),
    statement(transaction("a", "12,34")),
    statement(transaction("a", "1", "20260230000000")),
    statement().replace("<CURDEF>GBP", "<CURDEF>"),
    statement().replace("</BANKTRANLIST>", ""),
    statement().replace("<OFX>", "<OFX><!DOCTYPE foo>"),
    statement().replace("<STMTTRN>", "<STMTTRN><CORRECTFITID>old"),
    statement().replace("<OFX>", "<OFX><INVTRANLIST>"),
    statement() + statement(),
    statement().replace("<ACCTID>12345678", "<ACCTID>"),
  ])("rejects malformed, ambiguous or unsupported input", (text) =>
    expect(() => parseOfxStatement(text)).toThrow(),
  );
  it("rejects empty transaction lists and oversized files", () => {
    expect(() => parseOfxStatement(statement(""))).toThrow();
    expect(() => parseOfxStatement("a".repeat(5 * 1024 * 1024 + 1))).toThrow();
  });
});
