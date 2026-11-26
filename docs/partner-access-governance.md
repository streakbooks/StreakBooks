# Partner access governance: phases 7A and 7B

## Implemented data model

- `firm_client_access_grants` authorizes a particular firm staff member for one linked client
  and stores that member's role. It does not create a `company_members` row or consume the
  client's subscription seat limit.
- `firm_client_permission_requests` stores elevated access requests. Only an active client
  member with `members.manage` can approve or reject a request. Firm owners cannot grant their
  own elevated permissions by changing their role. The request gate includes ledger posting,
  sales and purchase transaction drafting, expense submission, reconciliation, bank-feed
  management, and client administration controls.
- `firm_client_access_events` records the granted staff member, client, module key, and access
  time. Opening a company module records a navigation event; guarded server authorization checks
  also record the requested module. Company Settings → Audit displays this client-visible log.
- `company_subscriptions.payer_kind` and `payer_firm_id` record the payer for each subscription.
  `firm_subscription_payer_consents` is required before the firm can become payer. Access checks
  do not depend on payer.
- `billing.firm_partner_tiers` holds owner-configured thresholds and discounts. The tier summary
  excludes trials and clients without a client-side company-member sign-in in the previous 120
  days; logins by staff of the firm do not keep a client active.
- `firms.status = 'suspended'` disables firm staff portfolio and delegated access without
  disabling a client's own company memberships.

## Disconnect and retention

Revoking a firm link immediately marks the link and its staff grants revoked, closes pending
permission requests, and writes a company audit event. Access log entries are append-only and
retain access metadata; they are not copies of client books. This migration does not delete
existing practice metadata or documents. Set and publish a contractually agreed retention period
before adding automated deletion for those records.

## Boundaries and remaining work

- Historic firm-created company memberships with a matching `private.firm_access_grants`
  provenance row and unchanged role/version are migrated to scoped grants and removed from the
  client seat count. Independently adjusted or untracked memberships remain for client review;
  audit those before claiming all historic staff seats are neutral.
- Access records show module visits and guarded server checks. They are navigation and authorization
  events, not a query-by-query record of individual rows viewed.
- The payer field and client-consent guard establish who is responsible for a company subscription;
  they do not reroute an existing provider invoice. A provider checkout/webhook for firm-paid client
  subscriptions and a separately priced, firm-owned seat subscription are still required before
  money can be collected from firms for software seats.
- Firm staff never become client `company_members`, so client seat enforcement and billing exclude
  them. The policy sets firm seats to the firm's subscription and prohibits charging the client for
  them without recorded agreement; firm seat collection is not yet connected to Stripe/Razorpay.
- Disconnect revokes access immediately. The application does not make a second copy of client
  accounting records in the firm's portfolio. Operational practice metadata and immutable security
  audit events remain under their existing retention controls; no contract retention duration was
  invented in code.
- The existing client administrator can link or disconnect a firm from their company workspace.
  This is an explicit authorization action, not a pending invitation acceptance workflow.

## Verification scenarios

See `docs/local-test-guide.md` for the isolated database scenarios covering two staff across two
clients, firm suspension, disconnection, permission approval, payer changes, seat counts, and the
120-day paid-client tier rule.
