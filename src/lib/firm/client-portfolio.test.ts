import { describe, expect, it } from "vitest";
import {
  csvField,
  DEFAULT_FIRM_CLIENT_COLUMNS,
  filterFirmClients,
  firmClientCsv,
  firmClientReviewState,
  localFirmDate,
  normalizeFirmClientColumns,
  toggleFirmClientColumn,
  type FirmClientRow,
} from "./client-portfolio";
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

describe("firm client directory review and layout", () => {
  const portfolio: FirmClientRow[] = [
    ...clients,
    { id: "c", company_id: "3", access_level: "view", companies: { name: "Gamma LLC" } },
  ];
  const scheduled: FirmClientProfile[] = [
    ...profiles,
    {
      ...profiles[0]!,
      company_id: "2",
      status: "active",
      service_line: "Tax",
      next_review_date: "2026-11-04",
    },
    {
      ...profiles[0]!,
      company_id: "3",
      status: "on_hold",
      service_line: "",
      next_review_date: null,
    },
  ];

  it("uses local calendar dates and classifies due, upcoming and unscheduled reviews", () => {
    expect(localFirmDate(new Date(2026, 10, 6, 0, 15))).toBe("2026-11-06");
    expect(firmClientReviewState("2026-11-06", "2026-11-06")).toBe("due");
    expect(firmClientReviewState("2026-11-07", "2026-11-06")).toBe("upcoming");
    expect(firmClientReviewState(null, "2026-11-06")).toBe("unscheduled");
  });

  it("filters review queues separately from practice status and searches access", () => {
    const options = { today: "2026-11-06" };
    expect(filterFirmClients(portfolio, scheduled, "", "all", { ...options, review: "due" })
      .map((row) => row.id)).toEqual(["b"]);
    expect(filterFirmClients(portfolio, scheduled, "", "all", { ...options, review: "upcoming" })
      .map((row) => row.id)).toEqual(["a"]);
    expect(filterFirmClients(portfolio, scheduled, "", "all", { ...options, review: "unscheduled" })
      .map((row) => row.id)).toEqual(["c"]);
    expect(filterFirmClients(portfolio, scheduled, "", "active", { ...options, review: "due" })
      .map((row) => row.id)).toEqual(["b"]);
    expect(filterFirmClients(portfolio, scheduled, "view", "all").map((row) => row.id))
      .toEqual(["b", "c"]);
  });

  it("sorts review dates with unscheduled last, and permits reverse name ordering", () => {
    expect(filterFirmClients(portfolio, scheduled, "", "all", { sort: "review" })
      .map((row) => row.id)).toEqual(["b", "a", "c"]);
    expect(filterFirmClients(portfolio, scheduled, "", "all", { sort: "review_desc" })
      .map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(filterFirmClients(portfolio, scheduled, "", "all", { sort: "name_desc" })
      .map((row) => row.id)).toEqual(["a", "c", "b"]);
    expect(filterFirmClients(portfolio, scheduled, "", "all", { sort: "service" })
      .map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("normalises saved columns and safely restores defaults", () => {
    expect(normalizeFirmClientColumns("malformed")).toEqual(DEFAULT_FIRM_CLIENT_COLUMNS);
    expect(normalizeFirmClientColumns(["tags", "tags", "__unknown__", "email"]))
      .toEqual(["tags", "email"]);
    expect(normalizeFirmClientColumns([])).toEqual([]);
    expect(toggleFirmClientColumn(["status", "review"], "review", false))
      .toEqual(["status"]);
    expect(toggleFirmClientColumn(["status"], "tags", true))
      .toEqual(["status", "tags"]);
  });
});
