# Property Management — Product Requirements Document

**Status:** Living · **Module path:** `/property-management` · **Priority:** P0 accounting integrity & owner statements

## Problem

Property managers, landlords and accountants need STR + LTR operations with owner settlement that reconciles to a real double-entry ledger. Spreadsheet P&Ls and channel CSV exports are not enough.

## Goals

1. Operate hybrid portfolios (STR, LTR, mixed) in one company.  
2. Reuse StreakBooks accounting — never a second GL.  
3. Produce explainable, reproducible owner statements.  
4. Calculate commissions, reserves and eligible payouts safely.  
5. Provide secure owner and tenant portals.  
6. Ship in independently testable PR batches.

## Non-goals (initial releases)

- Claiming live Airbnb/Vrbo/Booking.com APIs without provider approval  
- Country-specific statutory trust certification claims  
- Replacing banking, sales, purchases or Reports Centre  
- Demo-only buttons presented as complete workflows

## Personas

Property manager · Landlord / investor · Co-host · Accountant · Owner portal user · Tenant portal user

## Functional requirements (summary)

See implementation backlog PM-01…PM-14. Highest priority:

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-OS-1 | Generate owner statement for property/owner/period | Math reconciles opening → closing; every line links to source |
| FR-OS-2 | Statement lifecycle with immutable approved snapshot | Approved content cannot be silently rewritten |
| FR-CM-1 | Effective-dated commission rules | Historical settlements retain rule version used |
| FR-GL-1 | All money posts via `post_journal` | No orphan financial balances outside journals |
| FR-TR-1 | Trust beneficiary balances reconcile to bank + GL | Three-way recon workspace |
| FR-SEC-1 | Owner A cannot read Owner B data | RLS + RPC deny paths tested |

## Navigation (contextual)

Overview · Properties · Units · Owners · Tenants & Guests · Leases · Reservations · Calendar · Rent & Charges · Collections · Expenses · Maintenance · Management Fees · Owner Statements · Owner Payouts · Trust Accounting · Owner Portal · Tenant Portal · Reports · Integrations · Automation · Settings

## Business models (configured per company/agreement)

- **Agency** — manager holds client money; recognizes commission revenue; owner funds as liabilities  
- **Principal/operator** — operating entity recognizes rental revenue per contracts  
- **Owner-direct collection** — owner receives funds; manager may bill commission receivable  

## Definition of done

See directive final DoD and `docs/engineering/NEW-MODULE-DEFINITION-OF-DONE.md`. A workflow is complete only when UI, backend, accounting, security and tests are functional.
