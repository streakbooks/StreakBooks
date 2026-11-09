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
};

export type CrmAccountOverlayRow = {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  kind: string;
  openOpportunityCount: number;
  openPipelineValueMinor: number;
  linkedLeadCount: number;
  hasCrmActivity: boolean;
};

/**
 * Builds a CRM Accounts overlay from the Contacts master plus CRM facts.
 * Does not invent customers — contacts without CRM links are still listed
 * so sales can attach opportunities without a second master record.
 */
export function buildCrmAccountOverlay(input: {
  contacts: CrmAccountContactSeed[];
  leads: CrmAccountLeadSeed[];
  opportunities: CrmAccountOpportunitySeed[];
}): CrmAccountOverlayRow[] {
  const openOppByContact = new Map<string, { count: number; amountMinor: number }>();
  for (const opp of input.opportunities) {
    if (!opp.contactId || opp.status !== "open") continue;
    const prev = openOppByContact.get(opp.contactId) ?? { count: 0, amountMinor: 0 };
    openOppByContact.set(opp.contactId, {
      count: prev.count + 1,
      amountMinor: prev.amountMinor + Math.max(0, opp.amountMinor),
    });
  }

  const leadCountByContact = new Map<string, number>();
  for (const lead of input.leads) {
    if (!lead.contactId) continue;
    leadCountByContact.set(lead.contactId, (leadCountByContact.get(lead.contactId) ?? 0) + 1);
  }

  return input.contacts.map((contact) => {
    const opps = openOppByContact.get(contact.id) ?? { count: 0, amountMinor: 0 };
    const linkedLeadCount = leadCountByContact.get(contact.id) ?? 0;
    return {
      contactId: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      kind: contact.kind,
      openOpportunityCount: opps.count,
      openPipelineValueMinor: opps.amountMinor,
      linkedLeadCount,
      hasCrmActivity: opps.count > 0 || linkedLeadCount > 0,
    };
  });
}
