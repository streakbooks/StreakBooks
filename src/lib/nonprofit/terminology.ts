import type { NpSectionKey } from "./sections";

export const ORGANISATION_KINDS = [
  "ngo",
  "charity",
  "church",
  "temple",
  "mosque",
  "gurdwara",
  "ministry",
  "foundation",
] as const;

export type OrganisationKind = (typeof ORGANISATION_KINDS)[number];

const RELIGIOUS = new Set<OrganisationKind>(["church", "temple", "mosque", "gurdwara", "ministry"]);

export function organisationKind(value: string | null | undefined): OrganisationKind {
  return ORGANISATION_KINDS.find((kind) => kind === value) ?? "ngo";
}

export function isReligiousOrganisation(kind: string | null | undefined): boolean {
  return RELIGIOUS.has(organisationKind(kind));
}

export type OrganisationTerms = {
  sections: { [key in NpSectionKey]: string };
  groups: { [key: string]: string };
  household: string;
  gift: string;
  batch: string;
  ministry: string;
};

export function organisationTerms(kind: string | null | undefined): OrganisationTerms {
  const religious = isReligiousOrganisation(kind);
  return {
    sections: {
      overview: "Dashboard",
      funds: "Funds",
      transfers: "Transfers and releases",
      donors: religious ? "Members" : "Donors",
      donations: religious ? "Tithes and offerings" : "Donations",
      pledges: "Pledges",
      grants: "Grants",
      campaigns: religious ? "Collections" : "Campaigns",
      programmes: religious ? "Ministries" : "Programmes",
      expenses: "Functional expenses",
      people: religious ? "Congregation" : "People and governance",
      reports: religious ? "Giving reports" : "Fund reports",
      portals: religious ? "Member portal" : "Portals",
      settings: "Settings",
    },
    groups: {
      overview: "Overview",
      funds: "Funds and accounting",
      giving: religious ? "Members and giving" : "Donors and donations",
      grants: "Grants",
      fundraising: religious ? "Collections" : "Fundraising",
      programmes: religious ? "Ministries" : "Programmes",
      finance: "Financial operations",
      people: religious ? "Congregation" : "People and governance",
      reports: "Reports",
      portals: religious ? "Member portal" : "Portals",
      admin: "Settings",
    },
    household: religious ? "Family" : "Household",
    gift: religious ? "Tithe or offering" : "Gift",
    batch: religious ? "Collection batch" : "Bulk gifts",
    ministry: religious ? "Ministry" : "Programme",
  };
}
