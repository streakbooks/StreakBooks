# Supabase migration and security register

## Batch 1

| Item | Status |
| ---- | ------ |
| New migrations | **None** — UI/architecture only |
| Applied local | n/a |
| Applied staging | n/a |
| Applied production | **Not applied** — production authorization granted 2026-11-07, but chrome batches introduce no schema; other pending SQL must not be applied without rollback plan + staging proof |
| RLS changes | None |
| Security findings | No new surface claiming connected/synced without backend |

Future batches that add schema must append migration IDs, rollback notes and environment verification here.
