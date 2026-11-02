# Superadmin tasks

Work top to bottom. A task is done only when its tests have run and the box is ticked. Hosted project `ipxflpzfcqwtenodbxwc` stays untouched until `docs/HANDOFF.md` contains `BACKUP CONFIRMED`.

## NEEDS FROM OWNER

- [ ] BACKUP CONFIRMED in `docs/HANDOFF.md` before any hosted apply
- [ ] Test-mode payment secret in `.env.local` (`STRIPE_SECRET_KEY=sk_test_...` or Razorpay test keys) for provider calls
- [ ] Second platform user with `approvals.manage` for the kill-switch approval walkthrough
- [ ] Docker or a separate staging Supabase project for migration-history reconciliation

## P0 — Safety and verification

- [x] 1. Full suite: typecheck, lint, unit tests, build
- [ ] 2. Reject `sk_live_` unless an explicit production flag is set
- [ ] 3. Playwright Chromium plus a local `platform_owner` so grant and revoke run
- [ ] 4. Security-definer audit, search_path, anon revoke, migrations not applied
- [ ] 5. Reconcile migration history off production
- [ ] 6. Merge pull request 65 after `verify` and `voice-browser` are green

## Hosted database gate

- [ ] READY-TO-APPLY then apply `20261102170000` only after BACKUP CONFIRMED
- [ ] READY-TO-APPLY then apply security-definer migrations only after BACKUP CONFIRMED
- [ ] READY-TO-APPLY then apply start-month backfill only after BACKUP CONFIRMED

## Batch A

- [ ] Attach a quote to a subscription
- [ ] Second-approver flow end to end
- [ ] Mid-cycle add and remove with proration (BLOCKED without a test key)

## Batch B

- [ ] Usage overage invoicing
- [ ] Provider reconciliation
- [ ] Fees and net revenue
- [ ] Lifetime value

## Batch C

- [ ] Break-glass access
- [ ] Step-up MFA
- [ ] Admin IP allowlist
- [ ] Tamper-evident audit verification
- [ ] Authorisation tests for every platform role

## Batch D

- [ ] Integration health display
- [ ] API key rotation
- [ ] Webhook delivery history
- [ ] Backup visibility
- [ ] Data export
- [ ] Closure workflow

## Batches E–H

- [ ] Ledger integrity monitor
- [ ] AI governance
- [ ] Customer 360
- [ ] Global search
- [ ] Segments and tags
- [ ] Admin alert rules
- [ ] Job console
- [ ] Incident and release management
- [ ] Managed services desk
- [ ] Partner programme
- [ ] Config promotion
- [ ] Sandbox tenants

## Final

- [ ] Independent review, defect register, originality review, final report, pull request
