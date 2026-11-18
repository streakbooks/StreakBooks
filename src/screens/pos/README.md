# Point of Sale

Module `pos`, routes `/pos` and `/pos/registers`, shared ListWorkspace and shared searchable lookups. Sidebar registration is enabled; dedicated `pos.view` is required. Migrations must be reviewed/applied before register or checkout actions are usable.

Implemented: catalogue cart preview; register creation using existing physical locations/cash accounts; cashier location grants; audited, idempotent session open/close against expected cash; non-stock cash checkout with server repricing and ledger posting; cash in/out; full cash refunds while the original session remains open; bounded closed-session and recent-sale history; company-scoped state with loading/empty/error/retry handling.

Unimplemented: card/wallet providers, stock/COGS, variance GL posting UI, shifts/handover, Z-reports, offline and devices, restaurant workflows. No controls pretend to perform those actions. This remains `in-progress`, not a complete POS release. See `docs/pos/` for verification and release gates.
