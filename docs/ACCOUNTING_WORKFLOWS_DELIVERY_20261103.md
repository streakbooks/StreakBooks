# Accounting workflows delivery — 3 November 2026

Base: main `a30d55b` (PR #13). Branch: `feature/accounting-workflows`. Concurrent main `bd09907` (cash-basis Profit and Loss, PR #14) was merged into the branch and preserved before final validation.

## Implemented source workflows

| Task | Source implementation | Where to check |
|---|---|---|
| Purchasing | Transactional create, edit, status/audit and bill conversion; stable creation request IDs; optimistic edit versions; server search/status/pagination across all orders | Purchases → Purchase orders |
| Sales | Multi-line draft orders, versioned editing, confirmation/cancellation, persisted tax treatment/FX and transactional conversion to a linked draft invoice | Sales → Sales orders |
| Banking | OFX 1.x SGML and OFX 2.x XML bank/credit-card statement intake, QFX extension support, FITID preservation, duplicate preview and currency mismatch protection | Banking → Import statement |
| Accounting | Prepaid-expense and deferred-income monthly schedules, exact final-period rounding, explicit recognition/catch-up dates, posted-journal links, lock enforcement and idempotent posting | Accounting → Prepayments & deferred income |
| Discovery/operations | Sales subnavigation, command-palette entries, Sales orders feature status and a repeatable isolated PostgreSQL CI step | Module navigation, command palette, Settings → Features and GitHub quality gates |

The implementation reuses LinkBooks components, sales/purchasing arithmetic, permissions, document numbering, audit and the existing `post_journal` engine. No competitor source or assets were imported.

## Database and release state

The migration was created with the Supabase CLI: `supabase/migrations/20261103154859_accounting_workflow_depth.sql`. It adds sales-order/deferral tables, PO request/version columns, indexes, tenant read policies, restricted mutation RPCs and a wrapper around the existing Demo reset. It does not execute a reset or create financial transactions when applied.

**Live migration applied after explicit owner approval.** Automatic review initially rejected the live target without explicit authorization. The owner then answered “Approve live database migration”; application to `ipxflpzfcqwtenodbxwc` succeeded as migration version `20261103154859`. The CLI-created source filename was aligned with that actual migration-history version.

Post-application metadata confirms all three new tables have RLS and SELECT policies; the ten public workflow/reset RPCs are SECURITY INVOKER, executable by authenticated users and unavailable to anon. New workflow tables remained empty. Unauthenticated purchase/sales/deferral/reset probes were denied. The security advisor reported no findings associated with the new workflow objects; existing unrelated advisor findings remain outside this checkpoint. No live financial transaction or Demo reset was executed. Authenticated production UI workflows are still not certified by these metadata/auth-denial checks.

The safe rollback after deployment is to restore the previous application source while retaining the new database objects and all posted journals. The previous app's purchase-order columns/flows remain compatible. Do not drop tables, delete journals, reset a real company, or reverse entries automatically to roll back application code. Financial corrections require the existing explicit reversal workflow. No PITR/restore drill was performed by this delivery.

## Check on your local machine after release

```powershell
git checkout main
git pull origin main
npm.cmd ci
npm.cmd run dev
```

Use `npm` instead of `npm.cmd` on macOS/Linux. Keep your existing local environment configuration. Visit http://localhost:8080, sign in and select an authorized test company or Demo Company. The same accounting engine applies in demo; only the explicitly guarded reset path uses the demo flag.

If your local app connects to a separate Supabase database, it needs this migration too. With a running local Supabase stack, the inspected current CLI uses `npx supabase migration up` for the local target by default. Use your normal verified migration procedure for another remote target; do not reset a populated database to install the change. If Supabase assigns a different migration-history version, align the source filename with that recorded version before another CLI deployment.

### 1. Purchase orders

1. Create a supplier order with multiple discounted/taxed lines and save. Reopening it must preserve the number, currency, lines and memo.
2. Choose Edit draft, change the memo/lines and save. The same order ID/number is retained. Open the same draft in two tabs; after one tab saves, a stale save in the other must fail and ask for reload.
3. Search supplier name, order number or currency and filter statuses. Results are queried across all orders, in pages of 25. CSV explicitly exports the current page; it is not labelled a full export.
4. Mark as sent or cancel an eligible order. Status and activity are committed in one transaction. Manual Mark as sent still does not send email.
5. Convert a separate order to a draft bill. Repeated requests must return the existing bill. The bill retains lines, discounts and supplier terms and has no ledger impact until separately authorised.
6. Fractional regression: 1.5 × 10.01, zero discount/tax in GBP produces 15.01 under the existing purchasing engine. Conversion must preserve it.

Next purchasing depth: receiving/returns, approvals, partial billing, 2-/3-way matching and export of all filtered results. Existing direct table-write permissions were not globally removed as part of this release; the supported application mutations use the guarded RPCs.

### 2. Sales orders

1. Open Sales → Sales orders → New sales order. Select a customer, currency/date, accounts and multiple lines. A foreign currency requires a positive exchange rate to the company base currency.
2. Save/reopen/edit the draft. The source has separate read/draft permission checks and SQL validates every account/customer against the company.
3. Check fractional sales rounding: 1.5 × 10.01 with exclusive 20% tax produces 15.02 net + 3.00 tax = 18.02. Inclusive pricing uses the organisation's sales tax treatment instead; prices/discounts retain that treatment.
4. Confirm the order, select an invoice date on/after the order date and create a draft invoice. View invoice opens the linked record. Replaying conversion returns the same invoice. Posting and receipt collection remain separate invoice workflows.
5. Cancel a separate unbilled order through its confirmation prompt; it remains in records and cannot be invoiced. A confirmed/invoiced order is not draft-editable.
6. Searching/filtering and page navigation use server queries. Print order uses the browser's print dialog; this is a basic order print view, not a new branding/email/portal document type.

Next sales depth: delivery/partial invoicing, price lists, retainers, branded order document/attachments/email/portal integration, saved filter views and full-list exports. A changed organisation tax treatment blocks conversion of an older confirmed order rather than silently recalculating it.

### 3. OFX/QFX banking

1. Open Banking → Import statement and choose a matching bank or credit-card account.
2. Upload a single-account `.ofx` or `.qfx` statement. Its currency and account ending are shown. Verify the selected account; currency mismatches block import.
3. Verify dates, signed amounts, payee/memo and bank transaction IDs in the existing preview. Dates use the bank's posted calendar date; the importer does not shift it across time zones.
4. Import, then upload the same statement again. The existing stable external-ID/duplicate pipeline must recognize the FITIDs. Imported rows remain uncategorised until the normal coding/reconciliation workflow is completed.
5. Malformed/empty records, missing/duplicate/oversized FITIDs, nonrepresentable currency fractions, multiple accounts, DTD/entity/CDATA constructs, investment statements and correction transactions are rejected. CSV/TXT remain supported. QIF/QBO/PDF, live bank feeds and OFX correction/reversal handling remain pending.

### 4. Prepayments and deferred income

1. First post the original bill/invoice to the appropriate prepayment asset or deferred-income liability account using the existing posting workflow. The schedule's source reference is entered manually; the app does not automatically verify or allocate an original document balance.
2. Open Accounting → Prepayments & deferred income → New schedule. Choose Prepaid expense (debit expense / credit asset) or Deferred income (debit liability / credit income), source reference, amount excluding tax, first date and 1–120 monthly periods.
3. Example: GBP 100.01 over 3 months from 31 January gives 33.33, 33.33 and 33.35, on 31 January, 28 February and 31 March. The month anchor returns after February.
4. Creating a schedule posts no journal. Expand it and post a due entry with the chosen posting date. The result must be a balanced journal, linked from the entry. Duplicate/concurrent requests must not post twice.
5. A locked scheduled date must fail without linking a journal. For catch-up, explicitly select an open date on/after the scheduled date and no later than the company's current day. There is no automatic closed-period override.
6. Only entirely unposted active schedules can be cancelled. Completed schedules preserve history. If a recognition journal is reversed through the existing journal workflow, its entry shows a warning; it is not automatically reposted or treated as a new unposted item.
7. Demo reset clears new workflow dependencies before calling the existing guarded reset. Non-demo resets remain denied. This scenario was tested only against disposable local fixtures, never against a live company's records.

Next accounting depth: source-document allocation/reconciliation, schedule adjustments/reversals and auto-run workers, historical AP allocation history, complete cash-basis/tax acceptance, intercompany/consolidation and inventory valuation.

## Verification

- Full unit suite: **1,782 passed in 245 files**.
- Focused new API/arithmetic/import tests: passed; validators and server handlers are exercised with authority/transport mocks.
- Isolated PostgreSQL 17: actual workflow migration/RPC execution; atomic failure rollback, idempotency, version conflicts, tenant read isolation, forbidden writes, sales order lifecycle, exact schedule dates/amounts, period locks and balanced shared-engine postings.
- The first CI run exposed a test-runner startup race: the temporary PostgreSQL init server could answer a Unix-socket readiness probe before the final server started. The runner now waits for the final loopback TCP listener, with a bounded startup deadline. No database port is exposed.
- Three parallel recognition requests committed exactly one additional journal. Demo cleanup and non-demo reset denial passed.
- PostgreSQL fixtures use the repository's real `post_journal`, lock-check, audit and numbering function source with a bounded schema/auth/entitlement fixture. This is not the entire Supabase stack, complete production RLS matrix or a restore drill.
- `npm run test:workflows:postgres` requires Linux/WSL with the local Docker socket and PostgreSQL 17 image. It opens no database ports and creates/removes only its uniquely named container. GitHub quality gates run this test automatically.
- TypeScript, production build, whole-repository lint (0 errors, 20 pre-existing warnings), lookup architecture (136 declarations, 0 violations), navigation audit and diff whitespace passed at the local code checkpoint.
- Browser preview/authenticated staging UI acceptance and real external provider delivery were not run. No live financial transactions were created for testing.

## Broader pending programme

Full parity remains unfinished. The cross-navigation register remains [ACCOUNTING_PARITY_AUDIT_20261103.md](ACCOUNTING_PARITY_AUDIT_20261103.md). In addition to the explicit next items above: valued inventory/COGS/returns, timesheets/project billing, bank/payment/payout providers, mailbox/OCR intake, country tax filing/e-invoicing, worker deployment/retry monitoring, vendor/e-commerce migration connectors and live accounting/security/backup acceptance remain pending. Menu presence or a schema migration is not evidence that these are complete.
