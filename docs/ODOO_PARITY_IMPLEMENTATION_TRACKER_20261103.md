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
