import type { CompanyRole } from "@/lib/company-constants";

/** Plain-language duty of each role. Operational access can still be tailored per person. */
export const ROLE_SUMMARIES: Record<CompanyRole, string> = {
  owner:
    "Holds the organisation. Can transfer ownership and manage the subscription, and cannot be removed while they are the only owner.",
  admin:
    "Runs settings and people, and works across the books. Cannot transfer ownership or manage the subscription.",
  accountant:
    "Prepares, authorises and locks the ledger, including tax settings and the chart of accounts. Cannot change who has access.",
  bookkeeper:
    "Records day-to-day sales, purchases, banking and journals. Cannot change the chart of accounts, tax settings, or unlock a closed period.",
  staff:
    "Drafts sales and purchase documents and submits expenses. Cannot authorise documents, take payments, or reconcile the bank.",
  read_only:
    "Views lists, reports and audit history, and can export reports. Cannot create or change records.",
};
