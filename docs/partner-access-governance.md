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
  time. Company Settings → Audit displays this client-visible log.
- `company_subscriptions.payer_kind` and `payer_firm_id` record the payer for each subscription.
  `firm_subscription_payer_consents` is required before the firm can become payer. Access checks
  do not depend on payer.
- `billing.firm_partner_tiers` holds owner-configured thresholds and discounts. The tier summary
  excludes trials and clients without a company-member sign-in in the previous 120 days.
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
- Access logging is attached to server authorization helpers and the firm activity surface.
  Direct browser queries that bypass those helpers are not guaranteed to create a module access
  event; route all client data reads through guarded server functions before claiming a complete
  access log.
- The tier calculation and payer storage do not change provider invoices or transfer funds.
  Stripe/Razorpay routing to a firm's billing account requires a separate checkout and webhook
  integration before charging a firm.
- Firm staff are kept out of client `company_members`, so they do not consume client seats. A
  firm subscription, firm seat price, seat count, and payment collection flow are not yet wired
  to billing; the seat policy is documented but billing implementation remains pending.
- Payer consent and payer fields are enforced at the database boundary, but there is no customer
  UI or authorized billing service flow to change payer yet.
- The migration does not configure retention duration or automatically delete firm-owned client
  profiles, tasks, or documents after disconnection. Retention needs an agreed policy and a
  follow-up cleanup job before the no-copy-after-retention requirement is complete.
- Existing firm link creation still requires client `company.settings.edit` permission through
  the existing RPC. A dedicated client request/accept flow for a firm that is not already linked
  must be completed before broad rollout.

## Verification scenarios

See `docs/local-test-guide.md` for the isolated database scenarios covering two staff across two
clients, firm suspension, disconnection, permission approval, payer changes, seat counts, and the
120-day paid-client tier rule.
