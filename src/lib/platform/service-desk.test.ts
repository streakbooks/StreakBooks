import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { closeServiceCase, openServiceCase } from "./service-desk";

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

  it("closes an open case once and does not delete it", () => {
    expect(() =>
      openServiceCase({
        role: "platform_support",
        companyId: "company-1",
        subject: "Month-end help",
        reason: "Requested",
        alreadyOpen: true,
      }),
    ).toThrow(/already open/);
    expect(
      closeServiceCase({ role: "platform_support", status: "open", reason: "Done" }),
    ).toMatchObject({ status: "closed", ledgerAttached: false, deleted: false });
    expect(() =>
      closeServiceCase({ role: "platform_support", status: "closed", reason: "Done" }),
    ).toThrow(/no longer open/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102580000_service_case_close.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("platform_service_cases_one_open");
    expect(sql).toContain("platform_service_cases_company_fk");
    expect(sql).toContain("service_case.close");
    expect(sql).toContain("require_platform('support.manage')");
    expect(sql.toLowerCase()).not.toContain("delete from");
    expect(sql).not.toContain("journal_lines");
    expect(sql).not.toContain("platform_support_grants");
  });
});
