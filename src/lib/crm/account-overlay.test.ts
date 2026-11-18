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
        { id: "o1", contactId: "c1", status: "open", amountMinor: 12500, currencyCode: "USD" },
        { id: "o2", contactId: "c1", status: "won", amountMinor: 99999, currencyCode: "USD" },
        { id: "o3", contactId: "c2", status: "lost", amountMinor: 500, currencyCode: "USD" },
      ],
    });

    expect(rows).toHaveLength(2);
    const acme = rows.find((r) => r.contactId === "c1")!;
    expect(acme.openOpportunityCount).toBe(1);
    expect(acme.pipelineByCurrency).toEqual([{ currencyCode: "USD", amountMinor: 12500 }]);
    expect(acme.linkedLeadCount).toBe(1);
    expect(acme.hasCrmActivity).toBe(true);

    const quiet = rows.find((r) => r.contactId === "c2")!;
    expect(quiet.openOpportunityCount).toBe(0);
    expect(quiet.pipelineByCurrency).toEqual([]);
    expect(quiet.hasCrmActivity).toBe(false);
  });
  it("preserves separate currencies and ignores won deals in open pipeline totals", () => {
    const rows = buildCrmAccountOverlay({
      contacts: [
        { id: "c1", name: "Customer", email: null, phone: null, kind: "customer", isActive: true },
      ],
      leads: [],
      opportunities: [
        { id: "usd", contactId: "c1", status: "open", amountMinor: 5000, currencyCode: "USD" },
        { id: "eur", contactId: "c1", status: "open", amountMinor: 7500, currencyCode: "EUR" },
        { id: "eur2", contactId: "c1", status: "open", amountMinor: 2500, currencyCode: "EUR" },
        { id: "won", contactId: "c1", status: "won", amountMinor: 100000, currencyCode: "USD" },
      ],
    });
    expect(rows[0]?.openOpportunityCount).toBe(3);
    expect(rows[0]?.pipelineByCurrency).toEqual([
      { currencyCode: "EUR", amountMinor: 10000 },
      { currencyCode: "USD", amountMinor: 5000 },
    ]);
  });
});
