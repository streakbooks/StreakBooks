# Property Management — StreakBooks

Production-grade property accounting and owner settlement for StreakBooks.

**Baseline audit SHA:** `0ca84bef58d9783dd993c21eb72e145d979d1ab7` (GitHub `main`, 2026-11-18)  
**Authoritative repo:** https://github.com/streakbooks/StreakBooks  
**Local workstation:** `D:\MyApp\StreakBooks`

## Documents

| Document | Purpose |
| --- | --- |
| [EXISTING-STATE-AUDIT.md](./EXISTING-STATE-AUDIT.md) | Phase 0 capability classification |
| [DEPENDENCY-MAP.md](./DEPENDENCY-MAP.md) | Reuse of StreakBooks accounting/UI/platform |
| [MIGRATION-CONFLICT-REGISTER.md](./MIGRATION-CONFLICT-REGISTER.md) | Concurrent migration / branch risks |
| [COMPETITOR-GAP-MATRIX.md](./COMPETITOR-GAP-MATRIX.md) | Phase 1 official-docs gap analysis |
| [PRD.md](./PRD.md) | Product requirements and acceptance |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Domain model, posting rules, nav |
| [IMPLEMENTATION-BACKLOG.md](./IMPLEMENTATION-BACKLOG.md) | PR batches PM-00…PM-14 |
| [PROGRESS-TRACKER.md](./PROGRESS-TRACKER.md) | Live progress and verification dimensions |

## Non-negotiable rules

1. Do **not** build a second general ledger. Reuse `post_journal`, COA, banking, sales, purchases, contacts, reports, tax, files, auth and company permissions.
2. Owner statements are a **settlement system**, not a filtered P&L.
3. Fail closed: no fake create/post/approve/pay until authorised backends exist.
4. Do not apply staging/production migrations or real payouts without explicit approval.
5. Preserve published git history (no force-push / rebase of pushed commits).

## Operating modes

- **A. Short-term rentals** — reservations, channel fees, cleaning, commissions, owner statements  
- **B. Long-term rentals** — leases, rent schedules, deposits, arrears, owner statements  
- **C. Hybrid** — both modes in one company with filters (no duplicate organisations)
