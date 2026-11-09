import { describe, expect, it } from "vitest";
import { buildCrmPersonDirectory } from "@/lib/crm/person-directory";

describe("buildCrmPersonDirectory", () => {
  it("shows only people from allowed customer accounts without duplicating master data", () => {
    const rows = buildCrmPersonDirectory([
      { id: "a", contactId: "customer", firstName: "Avery", lastName: "Morgan", email: "a@example.com", phone: null, jobTitle: null, roleLabel: null, isPrimary: true },
      { id: "b", contactId: "supplier", firstName: "Hidden", lastName: null, email: "private@example.com", phone: null, jobTitle: null, roleLabel: null, isPrimary: false },
    ], [{ id: "customer", name: "Acme" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ displayName: "Avery Morgan", accountName: "Acme" });
  });
  it("falls back to email for unnamed people", () => {
    const rows = buildCrmPersonDirectory([
      { id: "a", contactId: "customer", firstName: "", lastName: "", email: "contact@example.com", phone: null, jobTitle: null, roleLabel: null, isPrimary: false },
    ], [{ id: "customer", name: "Acme" }]);
    expect(rows[0]?.displayName).toBe("contact@example.com");
  });
});
