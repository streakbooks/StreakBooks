# Real Estate Management

Development and property-sales module at `/real-estate`. It is separate from Property Management, which remains the rental, owner and trust workspace.

## What this foundation does

- Projects, phases, structures, levels and a property register with status and price history
- A structure can only use a phase from its own project, and a unit floor must belong to the selected structure
- Reservations that lock a unit, including one active reservation per unit
- Bookings, agreements and contractual payment schedules that do not post revenue
- Customer collections posted as bank and contract liability
- Explicit revenue recognition under a saved point-in-time or over-time policy
- Commission suggestions, approval and posting
- Classified development costs; only operating expenses can be posted
- Draft and approved project budgets
- A ledger tie-out that compares collections, refunds, recognition, posted commissions and posted operating costs with the journals

Journals go through `post_journal`. Cash, invoices, agreements and milestones do not recognise revenue.

## What is not built

Customer and broker portals, construction contracts, escrow, financing, tax packs, document generation, AI actions and portfolio consolidation are not in this batch. Do not describe those screens as available.

## Database

Migrations `20261128232000` through `20261128281000`. Hosted application is blocked until backup evidence exists for Supabase project `qugoaaizclvkzesptovm`. The latest authorisation does not replace that backup check.

```powershell
npm.cmd run test:realestate:postgres
```
