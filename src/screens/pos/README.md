# Point of Sale

Module `pos`, routes `/pos` and `/pos/registers`, shared ListWorkspace and shared searchable lookups. Sidebar registration is enabled; dedicated `pos.view` is required. The migration must be reviewed/applied before register actions are usable.

Implemented: catalogue cart preview; register creation using existing physical locations/cash accounts; cashier location grants; audited, idempotent opening and unchanged-float closing; bounded closed-session history; company-scoped state, loading/empty/error/retry states and blank physical closing counts. Backend checks enforce permissions and tenant/location isolation.

Unimplemented: checkout, payments, cash movements, variance postings, shifts/handover, Z-reports, stock/COGS, refunds, offline and devices. No controls pretend to perform these actions. This remains `in-progress`, not a complete POS release. See `docs/pos/batch-2-review.md` and tracker for verification and release gates.
