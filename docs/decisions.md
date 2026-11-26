# Decisions

## Accountant and CPA partner seats

Firm staff are invited to a firm and granted access to each client separately. They never
consume a client's paid user limit, and an invitation to a client never asks the staff member
to buy a client licence. Firm seats belong on the firm's subscription and are priced to the
firm; they are not free firm-wide seats. The exact firm seat price remains an owner-configured
plan decision and must be shown to the firm before purchase. A firm cannot pass its seat cost
through to a client without that client's recorded agreement.

The company membership table remains the source for client users. `firm_client_access_grants`
is separate from `company_members` and is scoped to one firm, one client, and one firm staff
member. The payer is recorded per company subscription as `payer_kind` and `payer_firm_id`.
Firm billing responsibility requires active client consent. Changing payer does not participate in
access checks, so changing payer does not revoke the client's read access. Provider collection for
firm-paid client subscriptions and firm seat subscriptions remains a separate billing integration;
the payer marker alone does not charge or redirect a provider invoice.

## Client-owned records and firm suspension

Clients own their company records. Suspending a firm blocks its delegated staff grants, but
does not change company membership or the client's access to read and export its own records.
Disconnecting a firm revokes the link and grants immediately. The application does not mirror
the client's accounting ledger into a firm-owned data store. Existing practice metadata and
immutable audit events remain in their current tables under their existing retention controls;
no unapproved retention duration or destructive cleanup schedule is assumed.

## Elevated partner access

Firm owners may assign staff to linked clients with a per-client role. A firm role does not
automatically grant transaction posting, bank-feed management, billing, tax settings, company
settings, or member administration. A client member with the required permission must review
and approve a specific staff member's requested elevated permissions. The approval record
stores the reviewer, timestamp, reason, and exact permission set.

## Partner tier calculation

Partner tiers count only clients with an active paid subscription and at least one active
client-side company member who signed in during the prior 120 days. Sign-ins by members of the
partner firm do not count as client activity. Trials do not count. Platform owners configure
each tier threshold and discount; no discount is assumed or seeded.
