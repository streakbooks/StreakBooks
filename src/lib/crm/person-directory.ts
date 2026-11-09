/** Read-only CRM people overlay: Contacts remains the only authoritative person master. */
export type CrmAccountPerson = {
  id: string;
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  roleLabel: string | null;
  isPrimary: boolean;
};

export type CrmAccountName = { id: string; name: string };

export type CrmPersonDirectoryRow = CrmAccountPerson & {
  displayName: string;
  accountName: string;
};

export function buildCrmPersonDirectory(
  people: CrmAccountPerson[],
  allowedCustomerAccounts: CrmAccountName[],
): CrmPersonDirectoryRow[] {
  const accountNames = new Map(allowedCustomerAccounts.map((account) => [account.id, account.name]));
  return people.flatMap((person) => {
    const accountName = accountNames.get(person.contactId);
    if (!accountName) return []; // Never expose supplier-only or cross-company people
    const fullName = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
    return [{
      ...person,
      displayName: fullName || person.email?.trim() || "Unnamed contact",
      accountName,
    }];
  });
}
