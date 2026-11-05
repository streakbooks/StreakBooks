import { describe, expect, it } from "vitest";
import type { ConversionInput } from "./conversion-balances";
import { conversionReviewCsv } from "./conversion-review";

const balanced: ConversionInput = {
  conversionDate: "2026-01-01",
  baseCurrency: "USD",
  tb: [
    { accountId: "bank", debitMinor: 10_000n, creditMinor: 0n },
    { accountId: "equity", debitMinor: 0n, creditMinor: 15_000n },
  ],
  invoices: [
    {
      contactId: "client",
      reference: "INV-1",
      documentDate: "2025-12-15",
      currencyCode: "USD",
      amountMinor: 5_000n,
    },
  ],
  bills: [],
  acceptDifference: false,
};

describe("conversion review CSV", () => {
  it("includes account and contact names, base totals and the opening posting date", () => {
    const csv = conversionReviewCsv(
      balanced,
      [
        { id: "bank", code: "100", name: "Bank" },
        { id: "equity", code: "300", name: "Owner equity" },
      ],
      [{ id: "client", name: "Acme Corp" }],
    );
    expect(csv).toContain("Trial balance,100,Bank,2025-12-31,USD,100.00");
    expect(csv).toContain("Opening invoice,INV-1,Acme Corp,2025-12-15,USD,50.00");
    expect(csv).toContain("Base-currency total");
    expect(csv).toContain("150.00,150.00");
  });

  it("shows an explicitly accepted opening-equity adjustment in the correct direction", () => {
    const csv = conversionReviewCsv(
      {
        ...balanced,
        invoices: [],
        acceptDifference: true,
      },
      [],
      [],
    );
    expect(csv).toContain("Opening balance equity adjustment");
    expect(csv).toContain("USD,50.00,");
  });

  it("rejects a draft with any financial validation errors", () => {
    expect(() =>
      conversionReviewCsv({ ...balanced, conversionDate: "not-a-date" }, [], []),
    ).toThrow("validation errors");
  });

  it("neutralises spreadsheet formula injection in references and names", () => {
    const csv = conversionReviewCsv(
      { ...balanced, invoices: [{ ...balanced.invoices[0]!, reference: "=2+3" }] },
      [
        { id: "bank", code: "100", name: "Bank" },
        { id: "equity", code: "300", name: "@SUM(A1:A2)" },
      ],
      [{ id: "client", name: "+HYPERLINK()" }],
    );
    expect(csv).toContain("'=2+3");
    expect(csv).toContain("'+HYPERLINK()");
    expect(csv).toContain("'@SUM(A1:A2)");
  });
});
