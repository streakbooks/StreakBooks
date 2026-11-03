# Odoo accounting parity — staged implementation register (2026-11-03)

Authoritative repository: linkbusinessadvisory/LinkBooks. Keep independent LinkBooks UI and source code. The owner requested all P0–P3 functionality. An unchecked item is NOT completed merely because a route, test, or plan exists.

## Delivery policy

- Implement and verify P0 before enabling external financial data flows.
- Preview substantial UI changes before merge; keep changes on reviewable feature branches.
- Real financial workflows require authenticated UI -> API -> PostgreSQL -> journal -> reconciliation tests against an isolated staging Supabase project.
- Never deploy unconfigured payment, bank, tax or government integrations as functional.
- Do not use production user financial data for automated tests; preserve all posted journals and reversals.
- Additive migrations, rollback/restore evidence, RLS with two tenant identities, audit logging, and approved deployment are release gates.
- All provider credentials, financial institution consent, regulated tax mandates and local compliance reviews require the owner/provider.

## P0 — Accounting reliability

- [ ] Universal Journal Entries tab, with source and reversal linkage. Initial implementation in this PR reuses existing journal data for attachment-backed posting documents, subject to accounting.view; authenticated staging UI/DB verification, additional payment screens, and source coverage remain.
- [ ] GL/AR/AP/bank/reports: cross-ledger tie-out fixtures, zero unexplained differences, historical date/FX/credit scenarios, browser and database assertions.
- [ ] Period lock/reversal/permissions/idempotency: multi-request races, replay protection, locked and closed period negative tests, role matrix and immutable reversal chain.
- [ ] Two-tenant RLS, tested PITR/backups and restore drill, production monitoring/alerts with incident response runbooks.

## P1 — Everyday automation

- [ ] Bank-feed provider onboarding, institution consent, webhook/reconciliation, bank rule priority and multi-line matching. Requires provider account and commercial terms.
- [ ] Inbound document address per organisation, safe MIME intake, malware scanning, OCR, human review, duplicate prevention, draft bill and accounting evidence. Requires inbound email/OCR services.
- [ ] Recurring jobs, automated reminders, exception/retry queue and real provider-delivery results.
- [ ] Customer online payment and supplier payout provider integrations with signed webhooks, refunds, settlement/FX/fee reconciliation, compliance/approvals and sandbox tests.

## P2 — Accounting depth

- [ ] Country-by-country VAT/GST and electronic invoicing with tested reporting boxes and government or accredited PEPPOL/other connections.
- [ ] Deferred revenue and prepaid expense schedules, catch-up/adjustment and closed-period protection.
- [ ] Analytic distributions with GL dimensions, project budgets and financial drill-down.
- [ ] Asset register-to-GL reconciliation and authenticated complete cash-basis financial statements, including cash tax recognition.

## P3 — Business expansion

- [ ] Inventory ledger, quantity movements, inventory valuation layers, perpetual/periodic COGS, returns and negative-stock handling.
- [ ] Sales orders, delivery/receipt workflows, 2-way/3-way purchasing matching and exceptions.
- [ ] Intercompany AR/AP, eliminations, multicurrency consolidated statements and permissions.
- [ ] OAuth third-party e-commerce connectors and vendor migration jobs, financial control totals, resumability and exception reporting.

## This PR — exact boundary

Implements a reusable, read-only posting-journal tab in the shared DocumentRecordPanel for accounting.view users; source-type and tenant filters; explicit reversal linkage; debit/credit totals; pure mapping tests. No posting logic or database schema changed. Its integration and E2E tests have not been run in this connector session. It does NOT complete the overall P0 milestone or any P1–P3 item.


## Follow-up implementation tasks — 3 November 2026

See [the cross-navigation audit](ACCOUNTING_PARITY_AUDIT_20261103.md) and [delivery/local verification guide](ACCOUNTING_PARITY_DELIVERY_20261103.md).

- Purchase orders: multi-line discounted form, saved detail route, document actions, guarded manual status/cancellation, own-currency list/CSV, cancellation/conversion conflict protection and fractional-quantity discount preservation. This does not complete P3 purchasing receipt/matching or P0 transactional acceptance.
- Settings: shared server-backed document-email configuration readiness across Overview/Integrations; Demo restrictions and missing providers remain explicit. Configuration is not delivery verification.
- Current main's reporting PR #12 is preserved. Historical Aged Payables remains unsupported pending dated allocation/reversal history.
- Live authenticated UI/PostgreSQL/tenant/race tests, safe staging setup, transactional PO RPCs and provider integrations remain pending. No P0–P3 checkbox above is closed by these tasks.

## Workflow depth follow-up — purchasing, sales, banking, accounting

See [ACCOUNTING_WORKFLOWS_DELIVERY_20261103.md](ACCOUNTING_WORKFLOWS_DELIVERY_20261103.md) for implementation boundaries, local checks, migration/approval status and tests.

- Source implemented: transactional/versioned purchase orders and server browse; sales orders through draft invoice conversion; OFX/QFX bank statement intake; prepayment/deferred-income recognition schedules; compatible guarded Demo reset; isolated PostgreSQL CI scenarios.
- Local verification: 1,747 unit tests; real workflow RPC and shared-engine PostgreSQL fixtures; concurrency/lock/tenant/reset tests; build/type/lint/navigation/lookup checks.
- Live migration `20261103154859` was applied after the owner explicitly approved the database change. RLS/RPC permissions, unauthenticated denials and new-object security advisories were checked; no live financial transactions or Demo reset were executed.
- P0 live authenticated acceptance, purchasing receipts/partial matching, historical AP, pricing/retainers, inventory/COGS, source-linked deferrals and provider integrations remain open. None of the broad P0–P3 milestones is closed here.
