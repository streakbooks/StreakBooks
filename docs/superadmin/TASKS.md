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
- [ ] 5. BLOCKED: Docker is not installed, and the only other Supabase project is LeadOrbit, which is not a LinkBooks staging database. Create an empty LinkBooks staging project, or install Docker Desktop or Podman on PATH. Production was not changed.
- [x] 6. Merge pull request 65 after `verify` and `voice-browser` are green (`9fc4429`)

## Hosted database gate

- [ ] BLOCKED: READY-TO-APPLY `20261102170000`. Apply only after `BACKUP CONFIRMED` is written in `docs/HANDOFF.md`.
- [ ] BLOCKED: READY-TO-APPLY `20261102180000` and `20261102180100`. Apply only after `BACKUP CONFIRMED` is written in `docs/HANDOFF.md`.
- [ ] BLOCKED: start-month backfill SQL is in `docs/superadmin/start-month-backfill.md`. Apply only after `BACKUP CONFIRMED` is written in `docs/HANDOFF.md`.
- [ ] BLOCKED: READY-TO-APPLY `20261102190000` through `20261102400000`. Apply only after `BACKUP CONFIRMED` is written in `docs/HANDOFF.md`.

## Batch A

- [x] Attach a quote to a subscription
- [ ] Second-approver flow end to end. Decision tests passed. Live walkthrough BLOCKED until a second platform user with `approvals.manage` exists.
- [ ] Mid-cycle add and remove with proration. Calculation tests passed, 5. Provider call BLOCKED until a test-mode secret is in `.env.local`.

## Batch B

- [ ] Usage overage invoicing. Draft tests passed. `20261102370000` can save a draft and was not applied. Posting BLOCKED until a test-mode secret is in `.env.local`.
- [ ] Provider reconciliation. BLOCKED until a test-mode secret and provider events exist.
- [x] Fees and net revenue. Missing fees stay unavailable, not zero. A supplied fee is stored only by the unapplied `20261102340000` function.
- [x] Lifetime value. Missing history stays unavailable, not zero. `20261102360000` stores supplied payments and was not applied.

## Batch C

- [x] Break-glass access
- [x] Step-up MFA
- [x] Admin IP allowlist
- [x] Tamper-evident audit verification
- [x] Authorisation tests for every platform role

## Batch D

- [x] Integration health display
- [x] API key rotation
- [x] Webhook delivery history
- [x] Backup visibility
- [x] Data export
- [x] Closure workflow

## Batches E–H

- [x] Ledger integrity monitor
- [x] AI governance
- [x] Customer 360
- [x] Global search
- [x] Segments and tags
- [x] Admin alert rules
- [x] Job console
- [x] Incident and release management
- [x] Managed services desk
- [x] Partner programme
- [x] Config promotion
- [x] Sandbox tenants

## Final

- [ ] Independent review, defect register, originality review, final report, pull request
