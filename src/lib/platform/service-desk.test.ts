import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openServiceCase } from "./service-desk";

describe("managed services desk", () => {
  it("opens a case without a ledger attachment", () => {
    expect(
      openServiceCase({
        role: "platform_support",
        companyId: "company-1",
        subject: "Month-end help",
        reason: "Requested",
      }),
    ).toMatchObject({ status: "open", ledgerAttached: false });
  });

  it("refuses finance and leaves support grants alone", () => {
    expect(() =>
      openServiceCase({
        role: "platform_finance",
        companyId: "company-1",
        subject: "Month-end help",
        reason: "Requested",
      }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102300000_service_desk.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).not.toContain("platform_support_grants");
    expect(sql).not.toContain("journal_lines");
  });
});
