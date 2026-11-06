import { describe, expect, it } from "vitest";
import {
  csvField,
  firstFiftyFirmClientIds,
  selectedVisibleFirmClients,
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
  function ids(
    options: NonNullable<Parameters<typeof filterFirmClients>[4]> = {},
    status: Parameters<typeof filterFirmClients>[3] = "all",
    search = "",
  ): string[] {
    return filterFirmClients(portfolio, scheduled, search, status, {
      ...options,
      today: "2026-11-06",
    }).map((row) => row.id);
  }

  it("uses local calendar dates and classifies due, upcoming and unscheduled reviews", () => {
    expect(localFirmDate(new Date(2026, 10, 6, 0, 15))).toBe("2026-11-06");
    expect(firmClientReviewState("2026-11-06", "2026-11-06")).toBe("due");
    expect(firmClientReviewState("2026-11-07", "2026-11-06")).toBe("upcoming");
    expect(firmClientReviewState(null, "2026-11-06")).toBe("unscheduled");
  });

  it("filters reviews independently from practice status and searches access", () => {
    expect(ids({ review: "due" })).toEqual(["b"]);
    expect(ids({ review: "upcoming" })).toEqual(["a"]);
    expect(ids({ review: "unscheduled" })).toEqual(["c"]);
    expect(ids({ review: "due" }, "active")).toEqual(["b"]);
    expect(ids({}, "all", "view")).toEqual(["b", "c"]);
  });

  it("sorts review dates with unscheduled last, and supports reverse name sorting", () => {
    expect(ids({ sort: "review" })).toEqual(["b", "a", "c"]);
    expect(ids({ sort: "review_desc" })).toEqual(["a", "b", "c"]);
    expect(ids({ sort: "name_desc" })).toEqual(["a", "c", "b"]);
    expect(ids({ sort: "service" })).toEqual(["a", "b", "c"]);
  });

  it("normalises saved columns and safely restores defaults", () => {
    expect(normalizeFirmClientColumns("malformed")).toEqual(DEFAULT_FIRM_CLIENT_COLUMNS);
    expect(normalizeFirmClientColumns(["tags", "tags", "__unknown__", "email"])).toEqual([
      "tags",
      "email",
    ]);
    expect(normalizeFirmClientColumns([])).toEqual([]);
    expect(toggleFirmClientColumn(["status", "review"], "review", false)).toEqual(["status"]);
    expect(toggleFirmClientColumn(["status"], "tags", true)).toEqual(["status", "tags"]);
  });
});

describe("firm client bulk selection guards", () => {
  it("excludes clients without visible company access and deduplicates IDs", () => {
    const rows: FirmClientRow[] = [
      ...clients,
      { id: "restricted", company_id: "3", access_level: "view", companies: null },
      { ...clients[0]!, id: "duplicate" },
    ];
    expect(firstFiftyFirmClientIds(rows)).toEqual(["1", "2"]);
    expect(selectedVisibleFirmClients(rows, ["1", "1", "3", "2"]).map((row) => row.company_id))
      .toEqual(["1", "2"]);
  });

  it("limits multi-client selection to fifty matching accessible rows", () => {
    const rows: FirmClientRow[] = Array.from({ length: 75 }, (_, index) => ({
      id: String(index),
      company_id: String(index),
      access_level: "view",
      companies: { name: `Client ${index}` },
    }));
    expect(firstFiftyFirmClientIds(rows)).toHaveLength(50);
    expect(selectedVisibleFirmClients(rows, rows.map((row) => row.company_id))).toHaveLength(50);
    expect(selectedVisibleFirmClients(rows.slice(0, 10), ["70", "71"])).toEqual([]);
  });
});
