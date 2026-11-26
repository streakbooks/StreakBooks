# Settings overhaul task list

Ordered work for the Settings module brief. Status reflects repository work, not hosted production state.

- [x] Phase 0 — audit current routes, UI, persistence, consumers, permissions, tests and module registry (`audit.md`). No feature code changed in this phase.
- [x] Phase 1 — official public benchmark, clean-room IA, decision and originality record (`benchmark.md`, `ia-design.md`, `docs/decisions/011-settings-information-architecture.md`, `docs/compliance/originality-log.md`).
- [x] Phase 2 — define typed per-setting coverage metadata and fail-closed coverage tests; document ownership and honest statuses. The three evidence-backed capabilities are complete; remaining typed fields stay partial and are read-only.
- [ ] Phase 3 / Batch 1 — canonical nested routes, universal breadcrumbs, legacy route compatibility and validated return-to-module are implemented. Authenticated browser E2E is pending because this workspace has no `E2E_EMAIL`/`E2E_PASSWORD` account, and the local `/settings` browser visit showed an application error.
- [ ] Phase 3 / Batch 2 — organisation identity and tax summary use a transactional, stale-snapshot-guarded RPC with before/after audit; its isolated SQL regression passes CI. Personal account settings remain partial (Profile/security exist; profile breadcrumbs and a complete preference surface are in progress).
- [ ] Phase 3 / Batch 3 — accounting and tax settings; prove safety and effective-date/audit requirements.
- [ ] Phase 3 / Batch 4 — sales and purchases settings; prove document workflow effects.
- [ ] Phase 3 / Batch 5 — banking, inventory, assets, expenses, payroll and projects; preserve existing module owners.
- [ ] Phase 3 / Batch 6 — users, access, firm/client grants, approvals and portal settings.
- [ ] Phase 3 / Batch 7 — notifications, automation, integrations and API.
- [ ] Phase 3 / Batch 8 — AI/voice, billing/subscription, security/audit, data/privacy.
- [ ] Phase 3 / Batch 9 — remaining modules discovered from `MODULE_REGISTRY`.
- [x] Final documentation artifacts — `REVIEW_GUIDE.md`, `coverage-matrix.md`, refreshed `05-TEST-REPORT.md`, and `defect-register.md` are present. The defect register explicitly states that its review is self-review, not an independent external audit.
- [x] Validation remediation — formatted the existing linted TS/TSX/MJS tree without weakening lint rules; aligned the browsing inventory guard with public Advisor storefront routes as well as authenticated modules. Full lint and browsing inventory checks now pass locally.
- [ ] Final deliverables — complete all remaining implementation batches and their verification; then update this task list and final report.
- [ ] Delivery — implementation commit `6586075d` and subsequent verification work are on `feat/settings-module-overhaul`; draft PR [#92](https://github.com/streakbooks/StreakBooks/pull/92) is open. Merge remains pending because batches 2–9, authenticated browser verification and green CI are not complete. Supabase hosted changes require target-specific backup confirmation; do not run blind migration sync.
