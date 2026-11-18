# Property Management — dependency and reuse map

## Must reuse (no parallel engines)

| Dependency | How PM uses it |
| --- | --- |
| `public.accounts` + COA industry packs | Map rent income, deposits, owner payables, trust banks, commission revenue |
| `public.post_journal` / `reverse_journal` | All money-changing PM postings |
| `journals` / `journal_lines` | Traceability from statement lines → GL |
| `accounting_periods` + period lock RPCs | Block posting in locked periods |
| `contacts` | Owners, tenants, guests, vendors — never duplicate identity |
| `sales_invoices` / receipts / credits | Rent charges, guest invoices where applicable |
| `purchase_bills` / payments | Property expenses and vendor costs |
| Banking match / reconciliation | Trust and operating bank recon |
| `tracking_categories` / `tracking_options` / line assignments | Property / unit / owner dimensions |
| Reports Centre (`src/lib/reports`) | Property P&L and portfolio reports |
| Tax engine | Channel/guest tax presentation where configured |
| Files / signed links | Statement PDFs, owner/tenant documents |
| Auth + `has_company_permission` + RLS | Company isolation and RBAC |
| App Store connection engine | Future PMS adapters (Hostaway, Guesty, …) |
| Customer/supplier portal patterns | Pattern reference for owner/tenant portals (scoped differently) |

## New domain (additive)

Property register, units, ownership shares, management agreements, leases, reservations, fee rules, owner statements + snapshots, payouts, reserves, trust beneficiary balances, portal access grants, sync events.

## Explicit non-dependencies

- Do not invent `pm_journals` or a second COA
- Do not treat App Store category presence as a PM product
- Do not claim live OTA APIs until provider-approved credentials exist
- Do not grant owners/tenants company-member accountant roles
