# Settings overhaul task list

Ordered work for the Settings module brief. Status reflects repository work, not hosted production state.

- [x] Phase 0 — audit current routes, UI, persistence, consumers, permissions, tests and module registry (`audit.md`). No feature code changed in this phase.
- [x] Phase 1 — official public benchmark, clean-room IA, decision and originality record (`benchmark.md`, `ia-design.md`, `docs/decisions/011-settings-information-architecture.md`, `docs/compliance/originality-log.md`).
- [ ] Phase 2 — define typed per-setting source-of-truth metadata and fail-closed coverage test; document settings ownership and honest statuses.
- [ ] Phase 3 / Batch 1 — canonical nested routes, universal breadcrumbs, legacy route compatibility, return-to-module, route/navigation e2e.
- [ ] Phase 3 / Batch 2 — organisation and personal settings; audit each field's owner, effect and tests.
- [ ] Phase 3 / Batch 3 — accounting and tax settings; prove safety and effective-date/audit requirements.
- [ ] Phase 3 / Batch 4 — sales and purchases settings; prove document workflow effects.
- [ ] Phase 3 / Batch 5 — banking, inventory, assets, expenses, payroll and projects; preserve existing module owners.
- [ ] Phase 3 / Batch 6 — users, access, firm/client grants, approvals and portal settings.
- [ ] Phase 3 / Batch 7 — notifications, automation, integrations and API.
- [ ] Phase 3 / Batch 8 — AI/voice, billing/subscription, security/audit, data/privacy.
- [ ] Phase 3 / Batch 9 — remaining modules discovered from `MODULE_REGISTRY`.
- [ ] Final deliverables — `REVIEW_GUIDE.md`, `coverage-matrix.md`, refreshed `TEST-REPORT.md`, independent review/defect register and final report.
- [ ] Delivery — run full gates, commit and push branch, open PR, merge only with CI and full suite green. Supabase hosted changes require target-specific backup confirmation; do not run blind migration sync.
