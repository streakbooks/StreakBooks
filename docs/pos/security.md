# Permissions and threat model

| Action                                          | Batch 1                            | Target permission / enforcement                                            |
| ----------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| Catalogue lookup and preview                    | `sales.view` plus auth, tenant RLS | Dedicated `pos.view` after migration                                       |
| Open/close register                             | Unavailable                        | `pos.register.open/close`, register/location ownership, atomic command     |
| Create/cancel sale                              | Unavailable                        | `pos.sale.create/cancel`, active cashier/session, audited state transition |
| Discount / price override                       | Unavailable                        | `pos.discount.apply/override`, `pos.price.override`, threshold step-up     |
| Refund                                          | Unavailable                        | `pos.refund.create/approve`, independent approver, original-origin limits  |
| Cash movements/count                            | Unavailable                        | `pos.cash.adjust/count`, reason and classification                         |
| Reports/export/audit                            | Unavailable                        | `pos.orders.view/export`, `pos.reports.view`, `pos.audit.view`             |
| Inventory/settlements/payments/devices/settings | Unavailable                        | Corresponding `pos.*` permission, company/location checks                  |

Dedicated role grants remain unimplemented; do not assume existing Sales roles are cashier roles. All mutations need database validation and default-deny policies, not just UI checks.

Threats: cross-company IDs (scoped query plus RLS; explicit product-company assertion); price tampering (ignore caller prices); unsafe arithmetic (safe integer inputs/bigint totals); SQL/PostgREST filter injection (existing escaped lookup helper); replay (preview has no mutation; future operation and webhook uniqueness); cached company leakage (keyed cart, query keys, no persistent cache; server reauthorizes every call); stale permissions (server checks every call); raw card exposure (no card input/storage); privileged function escalation (no new definer functions).

Remaining threat work: location/cashier scope, revocation and rate limits, offline local purge, kiosk step-up, provider signature replay windows, reconciliation fraud, maker-checker. Authenticated staging tenant attacks and DB RLS tests are release gates, not satisfied by mocked tests. No live security audit was run.
