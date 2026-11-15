import { describe, expect, it } from "vitest";
import {
  parseJournalBrowseSearch,
  pickJournalBrowseSearch,
} from "./journal-browsing";

describe("Accounting journal workspace browsing", () => {
  it("round-trips journal filters and pagination from a browser URL", () => {
    const encoded = new URLSearchParams({
      journalQ: "Rent & utilities", journalSource: "manual",
      journalFrom: "2026-01-01", journalTo: "2026-10-31",
      journalPageSize: "50", journalPage: "3",
      journalSort: "date", journalDir: "desc",
    });
    expect(parseJournalBrowseSearch(Object.fromEntries(encoded))).toEqual({
      journalQ: "Rent & utilities", journalSource: "manual",
      journalFrom: "2026-01-01", journalTo: "2026-10-31",
      journalPageSize: 50, journalPage: 3,
      journalSort: "date", journalDir: "desc",
    });
  });

  it("accepts supported posted-journal sources and default page zero", () => {
    for (const source of ["manual", "sales_invoice", "purchase_bill", "reversal", "payroll"]) {
      expect(parseJournalBrowseSearch({
        journalSource: source, journalPage: 0,
      })).toEqual({ journalSource: source, journalPage: 0 });
    }
  });

  it("rejects impossible dates and unsupported filter sources", () => {
    expect(parseJournalBrowseSearch({
      journalFrom: "2026-02-30", journalTo: "yesterday",
      journalSource: "other-tenant", journalQ: "x".repeat(121),
    })).toEqual({});
  });

  it("bounds deep-link pagination and rejects unsupported page sizes", () => {
    expect(parseJournalBrowseSearch({
      journalPage: "9999999", journalPageSize: "200",
    })).toEqual({ journalPage: 1_000_000, journalPageSize: 200 });
    expect(parseJournalBrowseSearch({
      journalPage: -1, journalPageSize: 15,
    })).toEqual({});
    expect(parseJournalBrowseSearch({
      journalPage: "1.5",
    })).toEqual({});
  });

  it("keeps validated sort direction only with an accepted sort key", () => {
    expect(parseJournalBrowseSearch({
      journalSort: "number", journalDir: "desc",
    })).toEqual({ journalSort: "number", journalDir: "desc" });
    expect(parseJournalBrowseSearch({
      journalSort: "sql", journalDir: "desc",
    })).toEqual({});
    expect(parseJournalBrowseSearch({
      journalSort: "amount", journalDir: "../admin",
    })).toEqual({ journalSort: "amount", journalDir: "asc" });
  });

  it("drops unrelated record IDs and external destinations", () => {
    expect(parseJournalBrowseSearch({
      tab: "journals", journal: "other-tenant", redirect: "https://evil.example",
      journalQ: "audit",
    })).toEqual({ journalQ: "audit" });
  });

  it("retains only journal browsing state when switching tabs", () => {
    expect(pickJournalBrowseSearch({
      journalQ: "utilities", journalPage: 4,
      journalSort: "source", journalDir: "asc",
    })).toEqual({
      journalQ: "utilities", journalPage: 4,
      journalSort: "source", journalDir: "asc",
    });
  });

  it("rejects ambiguous numeric and control-character journal filters", () => {
    for (const journalPage of ["00", "02", " 2", "2 ", "+2", "2e1", "0x10"]) {
      expect(parseJournalBrowseSearch({ journalPage, journalSource: "manual" }))
        .toEqual({ journalSource: "manual" });
    }
    for (const journalPageSize of ["050", " 50", "50 ", "1e2", "100.0", "+200"]) {
      expect(parseJournalBrowseSearch({ journalPageSize, journalSource: "manual" }))
        .toEqual({ journalSource: "manual" });
    }
    for (const journalQ of ["audit\nentries", "audit\rentries", "audit\tentries", "audit\u0000entries", "audit\u007fentries", "audit\u202eentries", "audit\u2066entries"]) {
      expect(parseJournalBrowseSearch({ journalQ, journalPage: 2 }))
        .toEqual({ journalPage: 2 });
    }
    expect(parseJournalBrowseSearch({ journalQ: "बहीखाता Café" }))
      .toEqual({ journalQ: "बहीखाता Café" });
  });

  it("discards inverted journal end dates but preserves independent filters", () => {
    expect(parseJournalBrowseSearch({
      journalFrom: "2026-12-31", journalTo: "2026-01-01",
      journalSource: "manual", journalPage: "3",
    })).toEqual({ journalFrom: "2026-12-31", journalSource: "manual", journalPage: 3 });
    expect(parseJournalBrowseSearch({
      journalFrom: "2026-01-01", journalTo: "2026-01-01",
    })).toEqual({ journalFrom: "2026-01-01", journalTo: "2026-01-01" });
  });

  it("supports empty/default direct-link states", () => {
    expect(parseJournalBrowseSearch({})).toEqual({});
    expect(parseJournalBrowseSearch({
      journalQ: "", journalSource: "", journalFrom: "",
      journalTo: "",
    })).toEqual({});
  });
});
