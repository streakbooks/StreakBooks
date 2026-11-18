export type CrmAccountContactSeed = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  kind: string;
  isActive: boolean;
};

export type CrmAccountLeadSeed = {
  id: string;
  contactId: string | null;
  status: string;
};

export type CrmAccountOpportunitySeed = {
  id: string;
  contactId: string | null;
  status: string;
  amountMinor: number;
  currencyCode: string;
};

export type CrmAccountCurrencyTotal = {
  currencyCode: string;
  amountMinor: number;
};

export type CrmAccountOverlayRow = {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  kind: string;
  openOpportunityCount: number;
  /** Intentionally do not add amounts across currencies without a validated FX rate. */
  pipelineByCurrency: CrmAccountCurrencyTotal[];
  linkedLeadCount: number;
  hasCrmActivity: boolean;
};

/**
 * Derives an RLS-authorized CRM overlay from the existing Contacts master.
 * Pipeline amounts are grouped by currency rather than falsely converted
 * to the company's base currency.
 */
export function buildCrmAccountOverlay(input: {
  contacts: CrmAccountContactSeed[];
  leads: CrmAccountLeadSeed[];
  opportunities: CrmAccountOpportunitySeed[];
}): CrmAccountOverlayRow[] {
  const openOppByContact = new Map<
    string,
    {
      count: number;
      currencyTotals: Map<string, number>;
    }
  >();

  for (const opp of input.opportunities) {
    if (!opp.contactId || opp.status !== "open") continue;
    const previous = openOppByContact.get(opp.contactId) ?? {
      count: 0,
      currencyTotals: new Map<string, number>(),
    };
    const currencyCode = opp.currencyCode.trim().toUpperCase() || "UNKNOWN";
    previous.count += 1;
    previous.currencyTotals.set(
      currencyCode,
      (previous.currencyTotals.get(currencyCode) ?? 0) + Math.max(0, opp.amountMinor),
    );
    openOppByContact.set(opp.contactId, previous);
  }

  const leadCountByContact = new Map<string, number>();
  for (const lead of input.leads) {
    if (!lead.contactId) continue;
    leadCountByContact.set(lead.contactId, (leadCountByContact.get(lead.contactId) ?? 0) + 1);
  }

  return input.contacts.map((contact) => {
    const opps = openOppByContact.get(contact.id);
    const linkedLeadCount = leadCountByContact.get(contact.id) ?? 0;
    return {
      contactId: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      kind: contact.kind,
      openOpportunityCount: opps?.count ?? 0,
      pipelineByCurrency: [...(opps?.currencyTotals ?? new Map<string, number>())]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor })),
      linkedLeadCount,
      hasCrmActivity: (opps?.count ?? 0) > 0 || linkedLeadCount > 0,
    };
  });
}
