# Architecture decisions

## ADR-001: reuse business masters (accepted)

Use existing companies, contacts, products, tax settings, accounts and dimensions. POS represents an originating channel, not a second customer/product/accounting system. Physical register locations reuse `hr_locations`; reporting dimensions do not create a second physical-store master.

## ADR-002: read-only quote precedes financial mutations (accepted)

`previewPosCatalogueCart` accepts only company, product IDs and quantities. Authentication middleware and dedicated `pos.view` run before queries. Products are bounded to 100 IDs, company and active status; company currency and tax treatment are server-read. Existing `computeTaxLineRounded` performs line arithmetic; bigint totals serialize as decimal strings. Browser values are never posting evidence. Quotes cannot authorize a charge and must be recalculated atomically at checkout. Search returns at most 50 active products with no purchase costs.

The `/pos` review surface uses `ListWorkspace` and a registered in-progress sidebar module with an explicit partial-implementation description. React Query keys include company and cart; the cart is keyed by active company and stores no localStorage data. No stale totals show during recalculation/errors. Refresh explicitly requests current prices. No custom design copies a competitor.

## ADR-003: atomic online cash sale (implemented locally; migration not live)

A single authenticated database command locks the active session, validates cashier/location, reprices catalogue lines, creates sale/lines/payment, updates expected drawer cash, invokes `post_journal` with `pos_sale` and commits. Unique operation IDs return the same persisted result for identical retries; changed payload under the same key is rejected. Application wiring lives in `src/lib/pos/cash-sale*` and `/pos` checkout; SQL is in `supabase/migrations/20261118140000_pos_cash_sale_expected_cash.sql` and is not applied to production until separately authorized. Inventory/COGS remain out of scope.

## ADR-004: external effects (proposed)

Provider calls and hardware operations cannot join the DB transaction. Use durable outbox/inbox with unique provider event references, signature checks and visible reconciliation exceptions. Payment captured, sale completed and settlement reconciled are distinct facts. Provider success with posting failure enters an operator-visible recoverable state.

## ADR-005: deployment gate (accepted)

Migration application, merge and deployment need separate explicit authorization. Local implementation and PR creation are authorized. No live mutation belongs to this batch.

## ADR-006: reuse physical locations and guarded session commands (implemented locally)

Reuse `hr_locations` rather than create a second store master. POS access is additive: location grants plus dedicated company permissions. Public invoker wrappers delegate to private definer commands that recheck the actor and tenant, lock register/session rows and write audit events in the same transaction. Client-supplied operation IDs bind retries to their original payload. UI mutations retain the operation ID across a failed retry; database uniqueness still protects refreshes. Switching company unmounts all POS forms and carts, with company-scoped query keys and no persistent browser storage.

The Registers page uses shared workspace and lookup components. An opening declaration does not post funds. A new closing form starts blank; it never pre-fills the expected count. Only zero-variance, no-movement sessions can close in this batch. Online cash checkout, cash adjustment journals, shifts/handover and Z-reports require the next reviewed transactional batch.
