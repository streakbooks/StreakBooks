# Phase 1 — Competitor gap matrix

**Method:** Official product documentation only (help centres / vendor guides). Competitors are functional references — do not copy proprietary UI, branding or assets.  
**StreakBooks baseline:** No PM module on `0ca84bef…`; generic GL/banking/sales/purchases/contacts/reports exist.

Priority: **P0** owner statements, commissions, payouts, trust, lease/rent, STR reservation accounting · **P1** portals, reserves, templates · **P2** polish / optional integrations.

## Matrix (verified capabilities)

| Competitor | Feature | Source | StreakBooks equivalent | Gap | Priority | Proposed implementation | Acceptance criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hostaway | Owner statements with reservation activity, expenses, owner vs manager payout; PDF/Excel | https://support.hostaway.com/hc/en-us/articles/36003559089947-Owner-Statements-Overview | Missing | No owner-period settlement | P0 | Native `pm_owner_statements` over remitted activity | Statement for owner+period; draft hidden until publish |
| Hostaway | Configurable statement formulas / fee splits | https://support.hostaway.com/hc/en-us/articles/56120866085659-Owner-Statements-Common-Questions | Missing | No commission engine | P0 | Versioned fee rules on management agreements | 20% fee → documented owner net |
| Hostaway | Owner portal modules | https://www.hostaway.com/features/owner-portal/ | Missing | No owner portal | P1 | Scoped portal grants | Owner sees only assigned properties |
| Guesty | Monthly owner statements with preview/approve/regenerate | https://help.guesty.com/hc/en-gb/articles/9369443472285-Getting-started-with-owner-statements | Missing | No statement lifecycle | P0 | Draft→approve→publish states | Auto draft for prior month; regenerate after rule change |
| Guesty | Revenue-share / commission calculations | https://help.guesty.com/hc/en-gb/articles/11298495425181-Revenue-share-in-owner-statements | Missing | No revenue-share calculator | P0 | Business-model formula fields | Channel commission reduces commission base when configured |
| Guesty | Trust-oriented cash + owner liabilities + bank recon | https://help.guesty.com/hc/en-gb/articles/9383160667933-Getting-started-with-Guesty-Accounting-and-owner-financial-management | Partial (banking/GL) | No trust sub-ledgers | P0 | Trust bank mapping + owner liabilities via GL | Owner liability = receipts − fees − expenses − payouts |
| OwnerRez | Escrow remittance; statements ≠ payouts | https://www.ownerrez.com/support/articles/property-management-overview | Missing | No remittance cycle | P0 | Statement entitlement + separate payout docs | Paid status only when payout recorded |
| OwnerRez | Record owner payouts; optional QBO push | https://www.ownerrez.com/support/articles/property-management-owner-payouts | Missing | No owner payout object | P0 | `pm_owner_distributions` posting via `post_journal` | Payout reduces owner payable; audit trail |
| Hostfully | Owner booking reports + share to portal | https://help.hostfully.com/en/articles/1993699-share-booking-reports-with-owners | Missing | No STR owner report publish | P0 | Booking-based statement lines + publish | Published appears in owner inbox |
| Hostfully | Owner adjustments with attachments | https://help.hostfully.com/en/articles/1944829-log-owner-adjustments-in-hostfully | Partial (expenses) | No owner-tagged adjustments | P0 | Owner charge/credit docs | Recurring fee on each statement |
| Lodgify | Owner payout rules by fee component | https://help.lodgify.com/hc/en-us/articles/360019453439-Manage-owners-payout-rules | Missing | No component payout rules | P0 | Per-component share rules | Cleaning retain vs pass-through |
| Lodgify | Owner statements with night allocation + mark paid | https://help.lodgify.com/hc/en-us/articles/360013613860-Create-and-manage-owner-statements | Missing | No night-split statements | P0 | Stay-night recognition policy | Cross-month stay splits correctly |
| Buildium | Cash owner statement with reserves / available for payment | https://help.buildium.com/hc/s/article/Rental-owner-statement-1557494407490 | Missing | No LTR cash settlement | P0 | Cash-basis owner statement | Available ≠ ending cash when reserves held |
| Buildium | Draws, contributions, management fee collection | https://help.buildium.com/hc/s/article/Available-Cash-Explained-1557492524154 | Missing | No draw/contribution ops | P0 | Contribution / draw / fee collection RPCs | Draw blocked below reserve |
| Buildium | Trust recon + three-way compliance reporting | https://help.buildium.com/hc/s/article/Trust-reconciliation-1557492524052 | Partial (bank recon) | No three-way trust | P0 | Trust recon workspace | Completes only when bank = GL = Σ beneficiaries |
| AppFolio | Owner portal statement packets / contributions | https://www.appfolio.com/help/owner | Missing | No owner packets | P1 | Portal packets + contribution intake | Owner downloads own packet only |
| AppFolio | Separate operating vs deposit trusts (practice) | https://info.appfolio.com/rs/appFolio/images/AppFolio_eBook_TrustAccounting.pdf | Missing | No deposit/operating trust split | P0 | Dual trust account mappings | Deposit cannot silent-post to operating |
| Rentvine | Portfolio owner statements + property double-entry | https://www.rentvine.com/features/trust-accounting | Missing | No portfolio statements | P0 | Portfolio + property ledgers | Multi-owner % split on distribution |
| Rentvine | Three-way bank reconciliation | https://help.rentvine.com/en/articles/16574862-how-to-complete-a-bank-reconciliation | Partial | No PM trust three-way UI | P0 | Extend banking recon views | Match gates on three totals |
| DoorLoop | Owner statement report (cash/accrual) | https://support.doorloop.com/en/articles/8160274-owner-statement-report | Missing | No owner statement report | P0 | Owner statement report + export | Filter owner/property/period |
| DoorLoop | Pooled trust with per-property cash ownership | https://support.doorloop.com/en/articles/6318781-introduction-to-trust-accounting | Missing | No property cash ownership | P0 | Beneficiary balances by property/owner | Report shows who owns cash |
| DoorLoop | Leases + recurring rent + tenant portal | https://support.doorloop.com/en/articles/6115751-create-a-new-lease | Missing | No lease/rent/portal | P0 | Lease + rent schedule + tenant portal | Rent posts on schedule; rent roll matches |
| Propertyware | Portfolio owner statements by account type | https://support.propertyware.com/s/article/How-Account-Types-Affect-the-Owner-Statement | Missing | No typed GL owner statement | P0 | COA mapping drives sections | Escrow excluded from operating section |
| Propertyware | Management fee calculator / passthrough | https://support.propertyware.com/s/article/How-To-Post-All-Management-Fees | Missing | No fee calculator | P0 | Fee run from commission rules | Passthrough hidden on owner statement |
| QuickBooks Online | Class tracking by property | https://quickbooks.intuit.com/learn-support/en-us/help-article/class-list/create-manage-classes-quickbooks-online/L1QzEOUxM_US_en_US | Partial (tracking) | No PM settlement product | P1 | Optional Property tracking + native statements | P&L by property matches tags |
| Xero | Client-money guide: liabilities, tracking, owner statements, three-way recon | https://www.xero.com/uk/guides/property-management-accounting/ | Partial (GL/banking) | No client-money product | P0 | Trust model + statements on StreakBooks GL | Bank = Σ liabilities = Σ landlord balances |

### Useful adjacent products

| Product | Note | Priority |
| --- | --- | --- |
| Guesty Lite | Ops/channel; accounting is Pro — not an accounting peer | — |
| Rent Manager | LTR trust + owner web access | P0/P1 |
| Stessa | Landlord self-mgmt / Schedule E — not PMC trust | P1 landlord mode |
| Odoo | Lease billing patterns; not trust settlement | P2 |

## Top P0 gaps for StreakBooks

1. Owner statement + settlement lifecycle (entitlement ≠ cash movement)  
2. Commission / revenue-share engine with effective-dated rules  
3. Trust / client-money accounting + three-way reconciliation  
4. STR reservation remittance accounting  
5. LTR lease, rent schedule, deposits as liabilities  
6. Owner and tenant portals (after settlement core)

## Originality

Build a StreakBooks-native experience using StreakBooks design system tokens and workspace components. Competitors inform acceptance criteria only.
