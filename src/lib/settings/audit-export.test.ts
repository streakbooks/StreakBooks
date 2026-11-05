import { describe, expect, it } from "vitest";
import {
  AUDIT_PAGE_SIZE,
  buildSettingsAuditCsv,
  hasNextSettingsAuditPage,
} from "./audit-export";

describe("Settings audit history paging", () => {
  it("offers Next only when a full page was returned", () => {
    expect(hasNextSettingsAuditPage(AUDIT_PAGE_SIZE + 1)).toBe(true);
    expect(hasNextSettingsAuditPage(AUDIT_PAGE_SIZE)).toBe(false);
    expect(hasNextSettingsAuditPage(AUDIT_PAGE_SIZE - 1)).toBe(false);
    expect(hasNextSettingsAuditPage(0)).toBe(false);
  });
});

describe("Settings audit history CSV", () => {
  it("exports a paginated tenant-authorised response with stable headers", () => {
    const csv = buildSettingsAuditCsv([
      {
        created_at: "2026-11-05T10:00:00Z",
        action: "settings.changed",
        entity_type: "company",
        entity_id: "abc",
        actor_user_id: "person",
      },
    ]);
    expect(csv).toContain('"When","Action","Entity type","Entity ID","Actor ID"');
    expect(csv).toContain('"settings.changed","company","abc","person"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("escapes quotes, strips newlines, and neutralizes spreadsheet formulas", () => {
    const csv = buildSettingsAuditCsv([
      {
        created_at: "2026-11-05",
        action: "=WEBSERVICE(\"url\")",
        entity_type: "company\nrecord",
        entity_id: "+SUM(1,2)",
        actor_user_id: null,
      },
    ]);
    expect(csv).toContain('"\'=WEBSERVICE(""url"")"');
    expect(csv).toContain('"company record"');
    expect(csv).toContain('"\'+SUM(1,2)"');
  });

  it("never invents an audit event when the response is empty", () => {
    expect(buildSettingsAuditCsv([]).split("\r\n").filter(Boolean)).toHaveLength(1);
  });
});
