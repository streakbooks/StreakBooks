import { describe, expect, it } from "vitest";
import { csvField, filterFirmClients, firmClientCsv, type FirmClientRow } from "./client-portfolio";
import type { FirmClientProfile } from "./client-profiles.functions";

const clients: FirmClientRow[] = [
  { id: "a", company_id: "1", access_level: "bookkeep", companies: { name: "Zebra Ltd" } },
  { id: "b", company_id: "2", access_level: "view", companies: { name: "Alpha Pty Ltd" } },
];
const profiles: FirmClientProfile[] = [
  {
    firm_id: "f",
    company_id: "1",
    status: "onboarding",
    primary_contact_name: "Maya",
    primary_contact_email: "maya@example.com",
    industry: "Retail",
    service_line: "Payroll",
    tags: ["monthly"],
    notes: "Internal",
    next_review_date: "2026-12-01",
    updated_at: "2026-11-04",
  },
];

describe("firm client portfolio", () => {
  it("sorts clients by name and filters by status", () => {
    expect(filterFirmClients(clients, profiles, "", "all").map((c) => c.id)).toEqual(["b", "a"]);
    expect(filterFirmClients(clients, profiles, "", "onboarding").map((c) => c.id)).toEqual(["a"]);
    expect(filterFirmClients(clients, profiles, "", "active").map((c) => c.id)).toEqual(["b"]);
  });
  it("searches contact, tags and services without displaying restricted UUIDs", () => {
    expect(filterFirmClients(clients, profiles, "maya", "all").map((c) => c.id)).toEqual(["a"]);
    expect(filterFirmClients(clients, profiles, "MONTHLY", "all").map((c) => c.id)).toEqual(["a"]);
    expect(filterFirmClients(clients, profiles, "payroll", "all").map((c) => c.id)).toEqual(["a"]);
    expect(
      filterFirmClients([{ ...clients[0]!, companies: null }], [], "", "all")[0]?.companies,
    ).toBeNull();
  });
  it("quotes CSV data and neutralises spreadsheet formulas", () => {
    expect(csvField('a"b,c')).toBe('"a""b,c"');
    expect(csvField("=HYPERLINK(1)")).toContain("'=HYPERLINK(1)");
    expect(csvField(" +SUM(1)")).toContain("' +SUM(1)");
    expect(firmClientCsv(clients, profiles)).toContain('"Onboarding"');
    expect(firmClientCsv(clients, profiles)).not.toContain("Internal");
  });
});
