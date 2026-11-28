/**
 * Operational compliance reminders. These packs do not submit filings,
 * calculate a statutory return, or claim government approval.
 * Confirm every item against the current official publication before use.
 */

export type CompliancePackId = "US" | "GB" | "IN" | "AU" | "CA" | "NZ" | "INT";

export type ComplianceItem = {
  id: string;
  title: string;
  reminder: string;
  sourceNote: string;
};

export type CompliancePack = {
  id: CompliancePackId;
  country: string;
  frameworkLabel: string;
  receiptTerminology: string;
  statutoryFiling: false;
  governmentApproved: false;
  items: readonly ComplianceItem[];
};

const confirm =
  "Confirm against the current official publication before relying on this reminder. StreakBooks does not file this return.";

export const COMPLIANCE_PACKS: readonly CompliancePack[] = [
  {
    id: "US",
    country: "United States",
    frameworkLabel: "US nonprofit accounting support",
    receiptTerminology: "Contribution receipt",
    statutoryFiling: false,
    governmentApproved: false,
    items: [
      {
        id: "us-990",
        title: "Form 990 information gathering",
        reminder:
          "Collect revenue, expense, compensation and governance information that a preparer may need for Form 990.",
        sourceNote: confirm,
      },
      {
        id: "us-quid",
        title: "Quid pro quo acknowledgement",
        reminder:
          "Where a donor receives goods or services, record the contribution and the estimated value of the benefit separately.",
        sourceNote: confirm,
      },
    ],
  },
  {
    id: "GB",
    country: "United Kingdom",
    frameworkLabel: "UK charity accounting support",
    receiptTerminology: "Donation acknowledgement",
    statutoryFiling: false,
    governmentApproved: false,
    items: [
      {
        id: "gb-sorp",
        title: "SORP presentation support",
        reminder:
          "Keep fund movements for unrestricted, restricted and endowment resources available for SORP-style statements.",
        sourceNote: confirm,
      },
      {
        id: "gb-gift-aid",
        title: "Gift Aid evidence",
        reminder:
          "Store the donor declaration reference the organisation already holds. This product does not submit a Gift Aid claim.",
        sourceNote: confirm,
      },
    ],
  },
  {
    id: "IN",
    country: "India",
    frameworkLabel: "Indian NGO accounting support",
    receiptTerminology: "Donation receipt",
    statutoryFiling: false,
    governmentApproved: false,
    items: [
      {
        id: "in-12ab-80g",
        title: "12AB and 80G records",
        reminder:
          "Record the organisation's registration references and the receipt serial used for donor reporting. This is not an income-tax filing.",
        sourceNote: confirm,
      },
      {
        id: "in-fcra",
        title: "Foreign contribution tracking",
        reminder:
          "Tag foreign contributions to the designated fund and keep the donor, currency and receipt identity together.",
        sourceNote: confirm,
      },
    ],
  },
  {
    id: "AU",
    country: "Australia",
    frameworkLabel: "ACNC charity accounting support",
    receiptTerminology: "Donation receipt",
    statutoryFiling: false,
    governmentApproved: false,
    items: [
      {
        id: "au-acnc",
        title: "ACNC reporting support",
        reminder:
          "Keep fund and activity totals that a preparer may use for an Annual Information Statement. This product does not lodge it.",
        sourceNote: confirm,
      },
      {
        id: "au-dgr",
        title: "Deductible gift recipient records",
        reminder:
          "Store the receipt fields the organisation configures. Deductibility is not determined by this software.",
        sourceNote: confirm,
      },
    ],
  },
  {
    id: "CA",
    country: "Canada",
    frameworkLabel: "Canadian charity accounting support",
    receiptTerminology: "Official donation receipt support",
    statutoryFiling: false,
    governmentApproved: false,
    items: [
      {
        id: "ca-receipt",
        title: "Donation receipt fields",
        reminder:
          "Capture donor identity, date, amount and the organisation's receipt number. This does not issue a CRA filing.",
        sourceNote: confirm,
      },
    ],
  },
  {
    id: "NZ",
    country: "New Zealand",
    frameworkLabel: "Public benefit entity support",
    receiptTerminology: "Donation receipt",
    statutoryFiling: false,
    governmentApproved: false,
    items: [
      {
        id: "nz-pbe",
        title: "PBE fund reporting support",
        reminder:
          "Retain restricted and unrestricted movements for public benefit entity reporting. This product does not file the performance report.",
        sourceNote: confirm,
      },
    ],
  },
  {
    id: "INT",
    country: "Other international jurisdictions",
    frameworkLabel: "Configurable nonprofit accounting",
    receiptTerminology: "Contribution receipt",
    statutoryFiling: false,
    governmentApproved: false,
    items: [
      {
        id: "int-policy",
        title: "Organisation policy",
        reminder:
          "Use the organisation's selected accounting policy. Do not assume a home-country filing obligation.",
        sourceNote: confirm,
      },
    ],
  },
];

export function compliancePack(id: CompliancePackId): CompliancePack {
  const pack = COMPLIANCE_PACKS.find((row) => row.id === id);
  if (!pack) throw new Error(`Unknown compliance pack ${id}`);
  return pack;
}
