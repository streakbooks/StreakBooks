# Supabase migration and security register

## Batch 1–22 (chrome)

| Item | Status |
| ---- | ------ |
| New migrations | **None** for chrome UI batches |
| Applied local | n/a |
| Applied staging | n/a |
| Applied production | n/a for chrome-only batches |
| RLS changes | None from chrome batches |
| Security findings | No new surface claiming connected/synced without backend |

## Batch 23 — production apply (2026-11-07)

| Item | Status |
| ---- | ------ |
| Target | Linked project `ipxflpzfcqwtenodbxwc` (production) |
| Method | `supabase db query --remote --yes -f` + `migration repair --status applied` (**not** `db push`) |
| Applied versions | `20261106115500` … `20261107011000` (11 files) — see `MIGRATIONS-APPLIED-20261107-BATCH23.md` |
| Also verified today | EM `20261107120000`–`…156000`, App Store `…157000`–`…163000`, demo `…170051` |
| Staging first | **Bypassed with owner authorization** — linked project is production; no separate staging Supabase project in this checkout |
| Postflight | Objects present: `budget_revisions`, `duplicate_budget`, `reconciliation_review_cases`, `tax_gl_review_sessions`, EM/marketplace |
| Not applied | ~46 older Oct local-only versions (history drift); colliding duplicate version slots already remote |
| Rollback | Additive only — restore PITR/backup then `migration repair --status reverted` after restore |

## Rollback plan (required before any production migration apply)

Full authorization does **not** skip these steps for **future** schema:

1. Identify migration ID(s) and reverse SQL / recovery path for the target environment.
2. Snapshot or confirm backup retention for the production project before apply.
3. Prefer staging first (RLS membership, unauthorized writes, accounting invariants) when a staging project exists.
4. Record pre/postflight digests and the exact command used (no secrets in docs).
5. Only then apply production; if postflight fails, execute the recorded rollback and stop go-live claims.

Batch 23 used owner-authorized direct apply on the linked production project with additive SQL and postflight object checks recorded in `MIGRATIONS-APPLIED-20261107-BATCH23.md`.

## Consolidated history preflight

Connect `psql` to the intended target using your private connection settings. Use an
account with read access to `supabase_migrations.schema_migrations`. Export only the
recorded versions and names, then compare them from the release checkout.

```powershell
psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/export-migration-history.sql -o target-migration-history.json
if ($LASTEXITCODE -ne 0) { throw "Migration history export failed." }
npm.cmd run check:migration-history -- target-migration-history.json
```

The export runs in a read-only transaction. The comparison runs offline. Exit code
`1` identifies history that needs investigation, including reused version slots,
previously applied Files migrations with old version numbers, gaps before the target's
latest applied version, or the corrected firm bulk-profile migration already recorded
on the target. A passing comparison establishes identity alignment for the exported
history. SQL equivalence, backup and restore rehearsal, and hosted acceptance still
require separate verification.
