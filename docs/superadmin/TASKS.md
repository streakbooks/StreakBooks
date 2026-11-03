# Superadmin tasks — current continuation

Updated 3 November 2026. Synchronize first and commit verified work to `main` only,
as the owner now requires. No Vercel commands, pushes or deployment checks.

## Completed and connected

- [x] Preserve/integrate the existing programme and PR #66 history on main.
- [x] Earlier hosted migrations through `20261103000200`, after the owner-recorded
      backup/restore rehearsal. See the evening handoff; do not re-label them unapplied.
- [x] MFA/live-session platform permissions and separate customer-ledger authorization.
- [x] Supervised support requests use the real approval inbox and actual scoped grants.
- [x] Self-approval/unsupported approval refusal; expiry, revocation, audit and rollback tests.
- [x] Customer 360 metadata tabs with explicit limits, empty and permission states.
- [x] Platform search and direct business/user/firm record navigation, including native
      links, related-record links, refresh, history and another tab.
- [x] Fix raw invalid record IDs surviving router validation.
- [x] Safe minor-unit lifetime-value handling and source validation.

Current command results, hosted migration state and commit evidence belong in
[STATUS.md](STATUS.md). A tick here refers to connected behavior and executed
verification, not to production certification or an independent human review.

## Still required

- [ ] Complete provider-backed test billing, price/item sync, proration, refund,
      usage posting and reconciliation. **BLOCKED for real provider tests** on a
      securely configured test-mode key and test data; continue adapter/UI engineering.
- [ ] Complete a real two-person MFA/approval walkthrough with a second authorized
      platform user. Synthetic SQL tests already exercise distinct identities.
- [ ] Complete safe-removal/dependency/billing previews and customer-notice workflows.
- [ ] Wire API key enforcement, webhook delivery/retry/dead-letter handling.
- [x] Run bounded support-expiry/operational-observation handlers with real pg_cron,
      retry/backoff/dead letters, manual recovery and retained attempt history.
- [x] Measure five operational alert sources with dedupe, acknowledgment, recovery,
      UTC quiet-hour labels and unknown/stale states.
- [ ] Connect additional billing/AI/integration alert sources and verified external delivery.
- [x] Connect case/incident ownership, deadlines/phases/notes/lifecycle, release evidence,
      segment preview/bulk membership/soft removal/archive/revision-checked undo.
- [ ] Complete support communications/time tracking/escalation and incident impact/follow-up workflows.
- [ ] Complete partner/wholesale and sandbox provisioning with tenant isolation.
- [ ] Complete configuration promotion validation and recovery workflow.
- [ ] Validate measured AI usage/spend with currencies kept separate.
- [ ] Enforce and verify trusted admin IP policies.
- [ ] Measure scale/p95/SLOs and run representative recovery/failure exercises.
- [ ] Review compatible dependency/security/performance remediations.
- [ ] Obtain independent human review; resolve findings and update the final report.

See [DEFECTS.md](DEFECTS.md) for concrete states and next actions. The master prompt
remains the full acceptance inventory. Earlier batches contained many standalone
helpers or draft stores; they do not count as complete operational systems.
