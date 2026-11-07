# Demo Company: sample data and reset

Every user can open their own **Demo Company Ltd** (a fictional UK company in GBP). It is marked
`is_demo`, so these steps never touch a live organisation.

## What gets sample data

| Module                                          | Sample data                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Banking, Sales, Purchases, Contacts, Accounting | Core ledger, invoices, bills, receipts, bank transactions (posted through the PostingEngine)                                                                                   |
| Expense Management                              | 18 claims in every state (draft to reimbursed), corporate cards and transactions, cash advance, petty cash float, mileage and per diem rates, spending requests, receipt inbox |
| Payroll                                         | 6 employees, monthly and weekly schedules, 7 pay runs (draft, calculated, approved, posted, partly paid, complete), payslips and payments                                      |
| Fixed Assets                                    | 4 asset types, 7 assets, monthly depreciation posted up to last month, one disposal; this month left to preview                                                                |
| Budgets                                         | Operating budget, stretch case and prior-year budget                                                                                                                           |
| Tax                                             | VAT registration details and draft VAT returns                                                                                                                                 |
| Reports                                         | Saved reports, owner dashboard, report packs, a paused schedule (never emails)                                                                                                 |
| Products & Services                             | Categories, three price lists, quantity tiers, discounts, customer defaults                                                                                                    |
| Accounting extras                               | Tracking categories, projects, recurring journals, deferral schedules                                                                                                          |
| Files                                           | Folders and files in every review state, inbox documents                                                                                                                       |
| Accountant                                      | Month-end practice tasks, account workpapers with reconciling items, AI journal review cases                                                                                   |
| Contacts                                        | Groups, tags, contact people, timeline entries, follow-up tasks                                                                                                                |
| Firm                                            | "Demo Practice LLP (sample)" with this company as a client: profile, onboarding steps, engagements                                                                             |
| Advisors Portal                                 | Sample engagement, workspace, document requests, messages and appointments                                                                                                     |
| App Store                                       | Install requests, connections, sync activity and alerts (no app shows as connected, because no connector is live yet)                                                          |
| Smart Action Center                             | Alerts generated from the data above                                                                                                                                           |

Because the Demo Company has one member, steps that need a second person (for example a reviewer
signing off a workpaper or report pack) stop at "prepared" or "ready".

## Reset and reseed (in the app)

1. Switch to **Demo Company Ltd** (organisation switcher, or _Open Demo Company_).
2. Go to **Settings → Demo** (the Demo tab only appears in the Demo Company).
3. Click **Reset & reseed demo data** and confirm.
4. Wait for the message _"Demo Company reset with sample data in all 15 modules"_. If a module
   could not be seeded, the message names it; the others are still seeded.

Reset deletes everything in the Demo Company (documents, journals, module data, the demo practice
and the demo Advisors portal client), rebuilds the chart of accounts and periods, posts the core
ledger and then seeds every module again. Anything you created while testing is removed.

## Reset from the database (support use)

Run as the demo owner (the functions refuse anyone else and any non-demo company):

```sql
select public.reset_demo_company('<demo company id>');
select public.seed_demo_modules('<demo company id>');
```

`seed_demo_modules` returns a per-module report (`{"payroll": {"ok": true, "detail": "..."}, ...}`).
The core ledger (invoices, bills, bank) is seeded by the app after a reset, so prefer the Settings
button; the SQL route reseeds module data only.
