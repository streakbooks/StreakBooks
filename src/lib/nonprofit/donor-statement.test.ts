import { describe, expect, it } from "vitest";
import {
  donorStatementCsv,
  donorStatementDelivery,
  donorStatementExcel,
  donorStatementPdf,
  statementPeriod,
} from "./donor-statement";

const statement = {
  organisationName: "Relief Trust",
  donorName: "Asha Donor",
  periodFrom: "2026-11-01",
  asOf: "2026-11-30",
  wording: "It is not a government filing and it is not a tax certificate.",
  lines: [{ label: "=cmd", currency: "USD", amountMinor: 13000 }],
};

describe("donor statements", () => {
  it("builds a calendar month, quarter and year from an anchor date", () => {
    expect(statementPeriod("week", "2026-11-28")).toEqual({
      from: "2026-11-22",
      asOf: "2026-11-28",
    });
    expect(statementPeriod("month", "2026-11-15")).toEqual({
      from: "2026-11-01",
      asOf: "2026-11-30",
    });
    expect(statementPeriod("quarter", "2026-11-15")).toEqual({
      from: "2026-10-01",
      asOf: "2026-12-31",
    });
    expect(statementPeriod("year", "2026-11-15")).toEqual({
      from: "2026-01-01",
      asOf: "2026-12-31",
    });
    expect(
      statementPeriod("custom", "2026-11-15", { from: "2026-11-02", asOf: "2026-11-09" }),
    ).toEqual({
      from: "2026-11-02",
      asOf: "2026-11-09",
    });
  });

  it("withholds email unless consent, an address and a configured sender all exist", () => {
    expect(
      donorStatementDelivery({
        requested: true,
        emailConfigured: false,
        consent: "granted",
        email: "asha@example.org",
        anonymous: false,
      }),
    ).toBe("not_configured");
    expect(
      donorStatementDelivery({
        requested: true,
        emailConfigured: true,
        consent: "unknown",
        email: "asha@example.org",
        anonymous: false,
      }),
    ).toBe("withheld");
    expect(
      donorStatementDelivery({
        requested: true,
        emailConfigured: true,
        consent: "granted",
        email: "asha@example.org",
        anonymous: false,
      }),
    ).toBe("ready");
    expect(
      donorStatementDelivery({
        requested: false,
        emailConfigured: true,
        consent: "granted",
        email: "asha@example.org",
        anonymous: false,
      }),
    ).toBe("not_requested");
  });

  it("downloads a csv, a spreadsheet and a pdf that keep the reconciled amount", () => {
    const csv = donorStatementCsv(statement);
    expect(csv).toContain("13000");
    expect(csv).toContain(`"'=cmd"`);
    expect(csv).toContain("not a tax certificate");
    const excel = donorStatementExcel(statement);
    expect(excel).toContain("13000");
    expect(excel).toContain("urn:schemas-microsoft-com:office:spreadsheet");
    const pdf = donorStatementPdf(statement);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("13000");
    expect(pdf).toContain("not a tax certificate");
  });
});
