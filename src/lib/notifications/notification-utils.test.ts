import { describe, expect, it } from "vitest";
import { filterActionNotifications, safeNotificationPath } from "./notification-utils";

const base = { title: "Bill awaiting approval", body: "Review supplier bill", category: "bill_approval",
  priority: "high", read_at: null, archived_at: null, resolved_at: null };
const rows = [
  { ...base, title: "Bill awaiting approval" },
  { ...base, title: "Overdue invoice", body: "Customer payment late", category: "overdue_invoice", read_at: "2026-10-30T00:00:00Z" },
  { ...base, title: "Bank review", category: "bank_reconciliation", priority: "critical", resolved_at: "2026-10-30T00:00:00Z" },
  { ...base, title: "Document request", category: "document_request", archived_at: "2026-10-30T00:00:00Z" },
];
describe("Action Center filtering", () => {
  it("shows only actionable notifications that have not been archived or resolved", () => {
    expect(filterActionNotifications(rows, {view:"action", category:"all", search:""})).toHaveLength(2);
  });
  it("only includes unresolved unread notifications in Unread", () => {
    expect(filterActionNotifications(rows, {view:"unread", category:"all", search:""}).map(x=>x.title))
      .toEqual(["Bill awaiting approval"]);
  });
  it("filters by module and case-insensitive text", () => {
    expect(filterActionNotifications(rows, {view:"all", category:"overdue_invoice", search:"CUSTOMER"}).map(x=>x.title))
      .toEqual(["Overdue invoice"]);
  });
  it("includes resolved work in Completed but excludes archived work", () => {
    expect(filterActionNotifications(rows, {view:"completed", category:"all", search:""}).map(x=>x.title))
      .toEqual(["Bank review"]);
  });
  it("shows archived requests only in Archived", () => {
    expect(filterActionNotifications(rows, {view:"archived", category:"all", search:""}).map(x=>x.title))
      .toEqual(["Document request"]);
  });
});
describe("notification navigation", () => {
  it("allows known same-origin nested record routes", () => {
    expect(safeNotificationPath("/purchases/bills/88888888-8888-8888-8888-888888888888"))
      .toBe("/purchases/bills/88888888-8888-8888-8888-888888888888");
  });
  it("rejects external, protocol-relative and script-based links", () => {
    for(const value of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil.example", null]){
      expect(safeNotificationPath(value)).toBeNull();
    }
  });
});
