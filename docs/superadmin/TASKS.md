# Superadmin tasks

Work top to bottom. A task is done only when its tests have run and the box is ticked. Hosted project `ipxflpzfcqwtenodbxwc` stays untouched until `docs/HANDOFF.md` contains `BACKUP CONFIRMED`.

## NEEDS FROM OWNER

- [ ] BACKUP CONFIRMED in `docs/HANDOFF.md` before any hosted apply
- [ ] Test-mode payment secret in `.env.local` (`STRIPE_SECRET_KEY=sk_test_...` or Razorpay test keys) for provider calls
- [ ] Second platform user with `approvals.manage` for the kill-switch approval walkthrough
- [ ] Install Docker Desktop or Podman and put it on PATH. Needed to seed a local platform_owner and to reconcile migration history off production. A separate empty staging Supabase project is the alternative for history reconciliation only.

## P0 — Safety and verification

- [x] 1. Full suite: typecheck, lint, unit tests, build
- [x] 2. Reject `sk_live_` unless an explicit production flag is set
- [ ] 3. BLOCKED: Chromium installed and the two public quote tests passed. Grant and revoke still skip. Install Docker Desktop or Podman on PATH so a local platform_owner can be seeded. Do not seed project ipxflpzfcqwtenodbxwc.
- [x] 4. Security-definer audit, search_path, anon revoke, migrations not applied
- [ ] 5. Reconcile migration history off production
- [ ] 6. Merge pull request 65 after `verify` and `voice-browser` are green

## Hosted database gate

- [ ] READY-TO-APPLY then apply `20261102170000` only after BACKUP CONFIRMED
- [ ] READY-TO-APPLY `20261102180000` and `20261102180100`, then apply only after BACKUP CONFIRMED
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
