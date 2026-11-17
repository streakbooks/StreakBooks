# Repository gap analysis

The table below records the original main baseline, before the POS batches; current implementation is described in the Batch 2 re-audit and tracker. Evidence is static source inspection plus local tests where stated; existing modules have not been authenticated against staging here.

| Capability                                        | Classification                            | Evidence / decision                                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POS transactions/registers/sessions               | Missing                                   | No POS routes, business services or POS tables on audited main. Marketplace `point_of_sale` category is catalogue metadata only.                                               |
| Catalogue, categories, fixed/tier/dated discounts | Existing but incomplete for POS           | `src/lib/products/`, migrations `20261106070924` through `20261106084717`; reuse `products`, do not duplicate. No barcode field or POS location pricing.                       |
| Preview from catalogue prices                     | Implemented, local testing pending        | Batch 1 `src/lib/pos/` and `src/screens/pos/`; no customer/promotion pricing.                                                                                                  |
| Contacts / CRM                                    | Existing but incomplete for POS           | `src/lib/products/customer-price-list.functions.ts`, `src/lib/crm/`; authoritative `contacts`. Loyalty, credit and gift cards need audit/design.                               |
| Sales / AR / receipts / credits                   | Existing but incomplete for POS           | `src/lib/sales/`; `posting.ts` uses `postJournal`, source IDs and idempotency. Reuse source conventions without duplicating revenue.                                           |
| Accounting                                        | Existing but incomplete for POS           | `src/lib/accounting/posting-engine.ts`; SQL `post_journal` evolves through payroll/expenses migrations. Dedicated atomic POS RPC and allowed source ownership require design.  |
| Products stock/COGS                               | Missing perpetual foundation              | `products-services.tsx` explicitly says catalogue does not value inventory/post COGS. `cash_inventory_evidence` is reporting evidence, not a perpetual stock valuation engine. |
| Goods receipts                                    | Planned for later / concurrent dependency | Open #230 receives POs; #231 match gates, #232 partial bill conversion. Do not duplicate or assume merged.                                                                     |
| Banking and cash reports                          | Existing but incomplete for POS           | `src/lib/reports/cash-inventory*`, banking module; no POS drawer movements/clearing settlements established.                                                                   |
| Tax                                               | Existing but incomplete for POS           | `src/lib/tax/`, Sales line math, company settings; composite and jurisdiction rules are not certified by a scalar catalogue rate.                                              |
| Membership / permission registry                  | Existing but incomplete for POS           | `assert-company-access.ts`, `permissions.ts`, `modules/registry.ts`; no POS granular grants yet. Batch 1 uses existing `sales.view`.                                           |
| Company / dimensions / locations                  | Existing but incomplete for POS           | `use-active-company.ts`, company context and dimension architecture; physical store ownership must be mapped before creating store entities.                                   |
| Providers/offline/hardware/restaurant             | Missing                                   | No audited POS implementation; marketplace/provider descriptions are not functioning integrations.                                                                             |

No existing capability is marked “Existing and working” solely from finding its code. No defect is asserted without reproduction.

Original baseline concurrent PR audit on 2026-11-17: #225 financial intelligence, #227 production contracts (draft), #229 historical AP, #230–236 purchasing, #237 CI. No POS branch found in remote branch listing. Shared files and migration ordering require a fresh fetch before every subsequent batch. This batch avoids purchasing, accounting and migration edits.

Original Batch 1 next step (now implemented in Batch 2): store/location ownership audit and dedicated permission/configuration migration with isolated PostgreSQL RLS tests; then register/session lifecycle. Retail stock remains blocked on separate inventory design. Provider work requires a named provider, supported region/device and test merchant credentials.

Supabase guidance review: fetched current changelog and RLS documentation. The April 2026 Data API exposure change is relevant to future table grants; Batch 1 added no tables and retained existing product grants/RLS. Batch 2 adds the guarded register/session tables described below. No schema mutation or new privileged function was needed for Batch 1. Postgres best practices informed bounded tenant-scoped queries and the proposed locking/index design.

## Batch 2 re-audit

Physical locations are authoritative in `hr_locations`; reporting locations in `tracking_options` are dimensions, not a second physical-store master. Register configuration reuses existing accounts and physical locations. New company/location/cashier access grants scope session operations. No duplicate store/customer/product master was created. Purchase goods receipts are not a valuation ledger and do not establish correct COGS.

Read-only connected-database inspection confirmed required columns on HR locations, accounts, company members and profiles, latest recorded migration `20261117220000`, and absence of the pending POS tables. Hosted security advisor summary: 92 INFO (RLS without policies), 21 mutable-search-path warnings, 26 anonymous-definer-execution warnings, 726 authenticated-definer-execution warnings and one leaked-password-protection warning. Some may be intentional guarded or deny-all designs; review them individually. No hosted schema/data changes were made.

Eight-vendor research now has official source evidence; Lightspeed/Clover retrieval gaps were resolved through current vendor documentation. No interface was copied and no device/provider support was inferred for LinkBooks.
