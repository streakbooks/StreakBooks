import { describe, expect, it } from "vitest";
import { applyMapping, assignExternalIds, parseCsvText } from "./csv-mapping";
import { QIF_MAPPING, parseQifStatement } from "./qif-import";

const entry = (
  date = "03/11'26",
  amount = "-12.34",
  rest = "PExample merchant\nMOffice supplies\nN007",
) => `D${date}\nT${amount}\n${rest}\n^\n`;
const statement = (body = entry(), kind = "Bank") => `!Type:${kind}\n${body}`;

describe("single-account QIF statement intake", () => {
  it("uses explicit day-first dates, normalizes apostrophe years and preserves cheque numbers", () => {
    const converted = parseQifStatement(statement(), "day-first");
    const mapped = applyMapping(parseCsvText(converted.csvText).rows, QIF_MAPPING, "GBP");
    expect(converted.transactionCount).toBe(1);
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows[0]).toEqual(
      expect.objectContaining({
        txnDate: "2026-11-03",
        amountMinor: -1234n,
        payee: "Example merchant",
        reference: "007",
        bankId: null,
      }),
    );
    expect(mapped.rows[0]!.description).toContain("Office supplies");
  });

  it("requires a chosen date order: ambiguous dates yield different verified dates", () => {
    const qif = statement(entry("01/02/2026", "1.23"));
    const day = parseQifStatement(qif, "day-first");
    const month = parseQifStatement(qif, "month-first");
    const mappedDay = applyMapping(parseCsvText(day.csvText).rows, QIF_MAPPING, "USD");
    const mappedMonth = applyMapping(parseCsvText(month.csvText).rows, QIF_MAPPING, "USD");
    expect(mappedDay.rows[0]?.txnDate).toBe("2026-02-01");
    expect(mappedMonth.rows[0]?.txnDate).toBe("2026-01-02");
  });

  it("supports US month-first, credit-card QIF and short years", () => {
    const result = parseQifStatement(statement(entry("12/31'26", "-4.50"), "CCard"), "month-first");
    const mapped = applyMapping(parseCsvText(result.csvText).rows, QIF_MAPPING, "USD");
    expect(mapped.rows[0]?.txnDate).toBe("2026-12-31");
    expect(mapped.rows[0]?.amountMinor).toBe(-450n);
    expect(() => parseQifStatement(statement(entry("12/31'26", "-4.50")), "day-first")).toThrow(
      /Invalid QIF date/,
    );
  });

  it("supports ISO, compact bank dates, named months and leap years", () => {
    const qif = statement(
      entry("2026-11-04", "3") +
        entry("20261105123000", "4") +
        entry("29 Feb 2028", "-5") +
        entry("2028-02-29", "6"),
    );
    const mapped = applyMapping(
      parseCsvText(parseQifStatement(qif, "day-first").csvText).rows,
      QIF_MAPPING,
      "GBP",
    );
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows.map((r) => r.txnDate)).toEqual([
      "2026-11-04",
      "2026-11-05",
      "2028-02-29",
      "2028-02-29",
    ]);
  });

  it("preserves quoted payees, memos and stable duplicate detection without invented bank IDs", async () => {
    const qif = statement(entry("03/11/2026", "-2.50", 'PMerchant, "X"\nMTea, coffee'));
    const converted = parseQifStatement(qif, "day-first");
    const mapped = applyMapping(parseCsvText(converted.csvText).rows, QIF_MAPPING, "GBP");
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows[0]?.description).toContain('Merchant, "X"');
    const first = await assignExternalIds(mapped.rows, "bank-a");
    const second = await assignExternalIds(mapped.rows, "bank-a");
    expect(first[0]?.externalId).toBe(second[0]?.externalId);
    expect(first[0]?.bankId).toBeNull();
  });

  it("retains two identical bank transactions as distinct rows using ordinals", async () => {
    const qif = statement(entry() + entry());
    const mapped = applyMapping(
      parseCsvText(parseQifStatement(qif, "day-first").csvText).rows,
      QIF_MAPPING,
      "GBP",
    );
    const keyed = await assignExternalIds(mapped.rows, "bank-a");
    expect(keyed).toHaveLength(2);
    expect(keyed[0]?.externalId).not.toBe(keyed[1]?.externalId);
  });

  it("ignores export category/cleared metadata without posting source categories", () => {
    const qif = statement("D03/11/2026\nT12\nL[Other account]\nC*\nPTransfer\n^\n");
    const mapped = applyMapping(
      parseCsvText(parseQifStatement(qif, "day-first").csvText).rows,
      QIF_MAPPING,
      "NZD",
    );
    expect(mapped.rows[0]?.amountMinor).toBe(1200n);
    expect(mapped.rows[0]?.description).toBe("Transfer");
  });

  it.each([
    statement("", "Bank"),
    statement(entry(), "Invst"),
    "!Account\nNName\n^\n!Type:Bank\n" + entry(),
    statement(entry() + "!Type:Bank\n" + entry()),
    statement(entry().replace("^\n", "")),
    statement(entry("31/02/2026")),
    statement(entry("29/02/2026")),
    statement(entry("abc")),
    statement(entry().replace("T-12.34\n", "")),
    statement(entry().replace("T-12.34\n", "T-12.34\nT9\n")),
    statement(entry().replace("N007", "SOffice\n$-12.34")),
    statement(entry().replace("N007", "U-9\nN007")),
    statement(entry().replace("N007", "Xunsupported")),
    statement(entry().replace("^\n", "^\n^\n")),
  ])("rejects unsupported or malformed statement records", (qif) => {
    expect(() => parseQifStatement(qif, "day-first")).toThrow();
  });

  it("rejects oversized, empty and missing-date-order inputs", () => {
    expect(() => parseQifStatement("x".repeat(5 * 1024 * 1024 + 1), "day-first")).toThrow();
    expect(() => parseQifStatement("", "day-first")).toThrow();
    expect(() => parseQifStatement(statement(), "" as never)).toThrow(/Choose/);
    expect(() =>
      parseQifStatement(statement().replace("D03/11'26", "D03/11'26\u0000"), "day-first"),
    ).toThrow();
  });
});
