# Property Management — architecture

## Module placement

- **Module id:** `property-management`  
- **Path:** `/property-management`  
- **Sidebar group:** `records` (with CRM / Contacts)  
- **Permission namespace:** `property.*`  
- **Screens:** `src/screens/property-management/`  
- **Routes:** `src/routes/_authenticated/property-management/`  
- **Lib:** `src/lib/property-management/`

## Domain model (candidates)

```
Company
  └─ pm_settings (enabled, operating mode defaults, COA mappings)
  └─ pm_properties 1─* pm_units
  └─ pm_owners → contacts
  └─ pm_property_ownership (effective-dated shares / allocation %)
  └─ pm_management_agreements (versioned; fee rules snapshotted)
  └─ pm_tenants → contacts
  └─ pm_leases / pm_rent_schedules
  └─ pm_reservations / pm_reservation_financial_lines
  └─ pm_fee_rules / pm_commission_calculations
  └─ pm_owner_statements / lines / snapshots
  └─ pm_owner_distributions / pm_owner_reserves
  └─ pm_trust_beneficiary_balances / pm_reconciliation_runs
  └─ pm_external_connections / mappings / sync_events
  └─ pm_portal_access / pm_audit_events
```

All money movements reference canonical `journals` / sales / purchases / bank docs via source FKs.

## Posting principles

1. Backend validates; UI never sole authority.  
2. Reversals/corrections — no silent mutation of posted journals.  
3. Statement approval freezes a snapshot of inputs, rules and outputs.  
4. Payout eligibility ≠ statement closing balance.  
5. Security deposits are liabilities, not rental income.  
6. Idempotent imports and statement jobs.

## Navigation contract

Deep links, back/forward, open-in-new-tab, breadcrumbs, filtered lists, loading/error/empty/forbidden states, theme compatibility — per premium navigation contract.

## Security

- Company RLS + `has_company_permission`  
- Portal access is object-scoped (owner/tenant), not company admin roles  
- Signed expiring file links for statements/attachments  
- Maker-checker for statement approve and payout approve

## PR sequencing

PM-00 docs → PM-01 nav/permissions/master data → PM-02 properties/owners/agreements → … → PM-07 statement engine (critical path) → payouts/trust → portals → reports → integrations → hardening.
