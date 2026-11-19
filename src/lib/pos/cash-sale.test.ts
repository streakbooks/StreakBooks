import { describe, expect, it } from "vitest";
import {
  parseCompletePosCashSale,
  parsePosCashSaleResult,
  parsePosRecordCashMovement,
  parseRefundPosCashSale,
} from "./cash-sale";

const companyId = "10000000-0000-4000-8000-000000000001";
const sessionId = "20000000-0000-4000-8000-000000000002";
const operationId = "30000000-0000-4000-8000-000000000003";
const productId = "40000000-0000-4000-8000-000000000004";

describe("POS cash sale parsers", () => {
  it("reuses quote line rules for checkout input", () => {
    expect(
      parseCompletePosCashSale({
        companyId,
        sessionId,
        operationId,
        cashTenderedMinor: "1500",
        lines: [{ productId, quantity: 1.5 }],
      }),
    ).toMatchObject({ cashTenderedMinor: "1500", lines: [{ productId, quantity: 1.5 }] });
    expect(() =>
      parseCompletePosCashSale({
        companyId,
        sessionId,
        operationId,
        cashTenderedMinor: "1",
        lines: [{ productId, quantity: 1.0000001 }],
      }),
    ).toThrow();
  });
  it("maps database sale JSON to camelCase totals", () => {
    expect(
      parsePosCashSaleResult({
        sale_id: sessionId,
        operation_id: operationId,
        subtotal_minor: "1000",
        tax_minor: "100",
        total_minor: "1100",
        tendered_minor: "2000",
        change_minor: "900",
        expected_cash_minor: "3100",
        journal_id: companyId,
      }),
    ).toEqual({
      saleId: sessionId,
      journalId: companyId,
      receiptCode: operationId,
      netMinor: "1000",
      taxMinor: "100",
      grossMinor: "1100",
      cashTenderedMinor: "2000",
      changeMinor: "900",
      expectedCashMinor: "3100",
    });
  });
  it("requires positive movement amounts and valid kinds", () => {
    expect(
      parsePosRecordCashMovement({
        companyId,
        sessionId,
        operationId,
        kind: "cash_in",
        amountMinor: "500",
      }).amountMinor,
    ).toBe("500");
    expect(() =>
      parsePosRecordCashMovement({
        companyId,
        sessionId,
        operationId,
        kind: "cash_out",
        amountMinor: "0",
      }),
    ).toThrow();
  });
  it("validates refund operation identity", () => {
    expect(parseRefundPosCashSale({ companyId, saleId: sessionId, operationId })).toEqual({
      companyId,
      saleId: sessionId,
      operationId,
    });
  });
});
