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

### Reconciliation evidence from 19 November 2026

The read-only production comparison used checkout `6577c3a4`. Production recorded
390 versions and a fresh isolated Supabase replay matched all 375 checkout versions.

- The histories share 320 versions. Among the 300 with recorded SQL on both sides,
  117 have identical ordered statement fingerprints and 183 differ. The other
  20 have insufficient statement metadata. Differences can reflect formatting
  or statement grouping and require further comparison before making schema claims.
- No exact fingerprint matched across the 55 checkout-only and 69 production-only
  versions with recorded SQL on both sides. The remaining production-only version
  lacks a fingerprint. These findings leave version reassignment unresolved.
- Production's three functions for the corrected firm bulk-profile migration match
  the function definitions from the fresh replay. The expected audit table and two
  triggers exist in production. The stored migration text digest differs from the
  checkout, so this verifies those schema objects only.
- The isolated POS integration suite passed its AAL1 denial and authorised AAL2 read
  cases. An isolated logical backup of the migration-history schema restored into a
  separate database with exactly 375 entries and an identical history digest.

The restore rehearsal covered isolated migration history. A hosted backup restore
and a staged upgrade rehearsal are still pending. No hosted schema or data changed.

### Isolated full PostgreSQL recovery rehearsal

On 19 November 2026, a cleanly stopped isolated Supabase PostgreSQL 17.12
data volume was archived and restored to a separate Docker volume. The restored
instance used the same Supabase PostgreSQL image and copied database
configuration. It started without a Docker network or a published port.

The restored database contained the synthetic recovery marker, the same 375
migration records and history digest, the recorded POS MFA migration, and its
five restrictive authenticated policies. The MFA helper was present.

This rehearsal verified the isolated PostgreSQL data directory and configuration.
Hosted backups, PITR, Supabase Storage objects, application sign-in, and a staged
upgrade against production-like migration history require separate checks.
