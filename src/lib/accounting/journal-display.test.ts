import { describe, expect, it } from "vitest";
import { JOURNAL_SOURCE_LABELS, journalLineCurrency, journalSourceLabel } from "./journal-display";

describe("accounting journal display", () => {
  it("offers all current posting sources, including payroll and fixed assets", () => {
    expect(JOURNAL_SOURCE_LABELS.payroll).toBe("Payroll");
    expect(JOURNAL_SOURCE_LABELS.depreciation).toBe("Depreciation");
    expect(JOURNAL_SOURCE_LABELS.asset_disposal).toBe("Asset disposal");
    expect(journalSourceLabel("manual")).toBe("Manual journal");
    expect(journalSourceLabel("fx_realised")).toBe("Realised FX");
    expect(journalSourceLabel("future_source")).toBe("future_source");
    expect(journalSourceLabel("toString")).toBe("toString");
  });

  it("uses the authoritative journal detail currency for original minor units", () => {
    expect(journalLineCurrency("JPY", "USD", "GBP")).toBe("JPY");
    expect(journalLineCurrency("KWD", "USD", "GBP")).toBe("KWD");
    expect(journalLineCurrency(null, "EUR", "GBP")).toBe("EUR");
    expect(journalLineCurrency("", null, "GBP")).toBe("GBP");
    expect(journalLineCurrency("   ", "USD", "GBP")).toBe("USD");
  });
});
