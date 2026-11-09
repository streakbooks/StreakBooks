import { describe, expect, it } from "vitest";
import { buildCrmAccountOverlay } from "@/lib/crm/account-overlay";

describe("buildCrmAccountOverlay", () => {
  it("aggregates open pipeline value without inventing contacts", () => {
    const rows = buildCrmAccountOverlay({
      contacts: [
        {
          id: "c1",
          name: "Acme Ltd",
          email: "a@acme.test",
          phone: null,
          kind: "customer",
          isActive: true,
        },
        {
          id: "c2",
          name: "Quiet Co",
          email: null,
          phone: null,
          kind: "customer",
          isActive: true,
        },
      ],
      leads: [
        { id: "l1", contactId: "c1", status: "converted" },
        { id: "l2", contactId: null, status: "new" },
      ],
      opportunities: [
        { id: "o1", contactId: "c1", status: "open", amountMinor: 12500 },
        { id: "o2", contactId: "c1", status: "won", amountMinor: 99999 },
        { id: "o3", contactId: "c2", status: "lost", amountMinor: 500 },
      ],
    });

    expect(rows).toHaveLength(2);
    const acme = rows.find((r) => r.contactId === "c1")!;
    expect(acme.openOpportunityCount).toBe(1);
    expect(acme.openPipelineValueMinor).toBe(12500);
    expect(acme.linkedLeadCount).toBe(1);
    expect(acme.hasCrmActivity).toBe(true);

    const quiet = rows.find((r) => r.contactId === "c2")!;
    expect(quiet.openOpportunityCount).toBe(0);
    expect(quiet.openPipelineValueMinor).toBe(0);
    expect(quiet.hasCrmActivity).toBe(false);
  });
});
