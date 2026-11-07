# Supabase migration and security register

## Batch 1

| Item | Status |
| ---- | ------ |
| New migrations | **None** — UI/architecture only |
| Applied local | n/a |
| Applied staging | n/a |
| Applied production | **Not applied** — full program authorization granted 2026-11-07, but chrome batches introduce no schema; other pending SQL still require staging proof + rollback before prod apply |
| RLS changes | None |
| Security findings | No new surface claiming connected/synced without backend |

## Rollback plan (required before any production migration apply)

Full authorization does **not** skip these steps:

1. Identify migration ID(s) and reverse SQL / `supabase db reset` recovery path for the target environment.
2. Snapshot or confirm backup retention for the production project before apply.
3. Apply and verify on staging first (RLS membership, unauthorized writes, accounting invariants).
4. Record pre/postflight digests and the exact command used (no secrets in docs).
5. Only then apply production; if postflight fails, execute the recorded rollback and stop go-live claims.

Chrome Batches 1–19: **no schema** — rollback plan unused. Future schema batches must append migration IDs, staging proof and rollback notes here.

Future batches that add schema must append migration IDs, rollback notes and environment verification here.
